//! OpenClaw Gateway Sidecar Management
//!
//! References:
//! - Tauri sidecar: https://v2.tauri.app/develop/sidecar/
//! - OpenClaw gateway CLI: https://docs.clawd.bot/cli/gateway
//! - OpenClaw gateway protocol: https://docs.clawd.bot/gateway/protocol
//!
//! Note: Currently uses globally installed `openclaw` command.
//! For production releases, consider bundling the binary as a sidecar.

use serde::{Deserialize, Serialize};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;

use crate::config::Config;

/// Gateway connection info returned to the frontend
///
/// The frontend uses this to connect via WebSocket.
/// See: https://docs.clawd.bot/gateway/protocol
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayInfo {
    /// WebSocket URL (e.g., ws://localhost:18789)
    pub url: String,
    /// Port the gateway is listening on
    pub port: u16,
    /// Auth token for the gateway (set via OPENCLAW_GATEWAY_TOKEN)
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayStatus {
    pub running: bool,
    pub info: Option<GatewayInfo>,
}

pub struct SidecarState {
    pub child: Option<Child>,
    pub info: Option<GatewayInfo>,
}

impl Default for SidecarState {
    fn default() -> Self {
        Self {
            child: None,
            info: None,
        }
    }
}

pub struct SidecarManager {
    pub state: Mutex<SidecarState>,
}

impl Default for SidecarManager {
    fn default() -> Self {
        Self {
            state: Mutex::new(SidecarState::default()),
        }
    }
}

impl SidecarManager {
    /// Start the OpenClaw gateway
    ///
    /// From OpenClaw docs (https://docs.clawd.bot/cli/gateway):
    /// - `--port <port>`: WebSocket port (default 18789)
    /// - `--token <token>`: Auth token
    /// - `--allow-unconfigured`: Skip config file requirement
    pub fn start(&self, _app: &AppHandle) -> Result<GatewayInfo, String> {
        let mut state = self.state.lock().map_err(|e| e.to_string())?;

        // Check if already running
        if let Some(ref mut child) = state.child {
            // Check if process is still alive
            match child.try_wait() {
                Ok(Some(_status)) => {
                    // Process exited, clear state
                    state.child = None;
                    state.info = None;
                }
                Ok(None) => {
                    // Process still running, return existing info
                    if let Some(ref info) = state.info {
                        return Ok(info.clone());
                    }
                }
                Err(_) => {
                    // Error checking status, clear state
                    state.child = None;
                    state.info = None;
                }
            }
        }

        // Load config to get API key
        let config = Config::load().map_err(|e| format!("Failed to load config: {}", e))?;
        let api_key = config
            .anthropic_api_key
            .ok_or("No API key configured. Please enter your Anthropic API key.")?;

        // Generate a token for gateway authentication
        // See: https://docs.clawd.bot/gateway/protocol#auth
        let token = generate_token();

        // Find openclaw command
        // Try: openclaw (global install via npm)
        let openclaw_cmd = find_openclaw().ok_or(
            "OpenClaw not found. Please install it with: npm install -g openclaw\n\
             See: https://docs.clawd.bot/install"
        )?;

        // Build and spawn the command
        // From OpenClaw docs: https://docs.clawd.bot/cli/gateway
        let child = Command::new(&openclaw_cmd)
            .args([
                "gateway",
                "--port",
                &config.gateway_port.to_string(),
                "--allow-unconfigured", // Skip config file requirement
            ])
            // Pass API key via environment (secure, not visible in process list)
            .env("ANTHROPIC_API_KEY", &api_key)
            // Set gateway token for WebSocket auth
            .env("OPENCLAW_GATEWAY_TOKEN", &token)
            // Don't inherit stdin, capture stdout/stderr
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn gateway: {}", e))?;

        let info = GatewayInfo {
            url: format!("ws://localhost:{}", config.gateway_port),
            port: config.gateway_port,
            token: token.clone(),
        };

        state.child = Some(child);
        state.info = Some(info.clone());

        println!("[openclaw] Gateway started at {}", info.url);
        Ok(info)
    }

    /// Stop the OpenClaw gateway
    pub fn stop(&self) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|e| e.to_string())?;

        if let Some(ref mut child) = state.child {
            // kill() sends SIGKILL
            child.kill().map_err(|e| format!("Failed to stop gateway: {}", e))?;
            // Wait for process to fully terminate
            let _ = child.wait();
            println!("[openclaw] Gateway stopped");
        }
        state.child = None;
        state.info = None;

        Ok(())
    }

    /// Get current gateway status
    pub fn status(&self) -> GatewayStatus {
        let mut state = match self.state.lock() {
            Ok(s) => s,
            Err(_) => return GatewayStatus { running: false, info: None },
        };

        // Check if process is still running
        if let Some(ref mut child) = state.child {
            match child.try_wait() {
                Ok(Some(_)) => {
                    // Process exited
                    state.child = None;
                    state.info = None;
                }
                Ok(None) => {
                    // Still running
                }
                Err(_) => {
                    // Error, assume dead
                    state.child = None;
                    state.info = None;
                }
            }
        }

        GatewayStatus {
            running: state.child.is_some(),
            info: state.info.clone(),
        }
    }
}

/// Find the openclaw command
fn find_openclaw() -> Option<String> {
    // Try to find openclaw in PATH
    let output = Command::new("which")
        .arg("openclaw")
        .output()
        .ok()?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Some(path);
        }
    }

    // Try common npm global locations
    let home = std::env::var("HOME").ok()?;
    let npm_locations = [
        format!("{}/.npm-global/bin/openclaw", home),
        format!("{}/node_modules/.bin/openclaw", home),
        "/usr/local/bin/openclaw".to_string(),
        "/opt/homebrew/bin/openclaw".to_string(),
    ];

    for loc in npm_locations {
        if std::path::Path::new(&loc).exists() {
            return Some(loc);
        }
    }

    None
}

/// Generate a random token for gateway authentication
fn generate_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!(
        "sclw-{:x}{:x}",
        duration.as_secs(),
        duration.subsec_nanos()
    )
}

// ============================================
// Tauri Commands (exposed to frontend via IPC)
// ============================================

#[tauri::command]
pub fn start_gateway(app: AppHandle) -> Result<GatewayInfo, String> {
    let manager = app.state::<SidecarManager>();
    manager.start(&app)
}

#[tauri::command]
pub fn stop_gateway(app: AppHandle) -> Result<(), String> {
    let manager = app.state::<SidecarManager>();
    manager.stop()
}

#[tauri::command]
pub fn get_gateway_status(app: AppHandle) -> GatewayStatus {
    let manager = app.state::<SidecarManager>();
    manager.status()
}
