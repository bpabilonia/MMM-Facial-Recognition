/**
 * MMM-Facial-Recognition
 * Magic Mirror module for facial recognition with multi-profile support
 * and automatic sleep mode after inactivity.
 */

Module.register("MMM-Facial-Recognition", {
    
    // Default configuration
    defaults: {
        prompt: "Face ID Active",
        guestPrompt: "Welcome, Guest",
        sleepPrompt: "Show your face to wake up",
        width: "200px",
        position: "center",
        pollInterval: 1000,           // How often to check for updates (ms)
        animationSpeed: 1000,         // Transition animation duration (ms)
        showUserImage: true,          // Show user profile picture
        showWelcomeMessage: true,     // Show welcome message
        dimOnSleep: true,             // Dim the entire display on sleep
        sleepDimLevel: 0.1,           // Opacity when sleeping (0-1)
        debug: false                  // Show debug panel with status info
    },
    
    // Module state
    currentUser: null,
    isKnown: false,
    isSleeping: false,
    isInitialized: false,
    startupTime: null,
    profiles: [],
    lastStatus: null,
    lastStatusTime: null,
    
    // DOM references
    wrapper: null,
    imageElement: null,
    messageElement: null,
    statusElement: null,
    debugElement: null,
    
    start: function() {
        Log.info("[MMM-Facial-Recognition] Starting module...");
        this.startupTime = Date.now();
        
        // Request available profiles from node_helper
        this.sendSocketNotification("GET_PROFILES", {});
    },
    
    getStyles: function() {
        return [
            this.file("css/mmm-style.css")
        ];
    },
    
    getDom: function() {
        // Create main wrapper
        this.wrapper = document.createElement("div");
        this.wrapper.className = "face-recognition-module";
        this.wrapper.classList.add(this.config.position);
        
        // Status indicator
        this.statusElement = document.createElement("div");
        this.statusElement.className = "fr-status";
        this.statusElement.innerHTML = '<span class="fr-status-dot"></span>' + this.config.prompt;
        this.wrapper.appendChild(this.statusElement);
        
        // Profile image container
        const imageContainer = document.createElement("div");
        imageContainer.className = "fr-image-container";
        
        this.imageElement = document.createElement("img");
        this.imageElement.className = "fr-profile-image";
        this.imageElement.src = this.file("public/guest.gif");
        this.imageElement.alt = "Profile";
        // Set explicit dimensions to prevent layout shift during image load
        this.imageElement.width = 100;
        this.imageElement.height = 100;
        imageContainer.appendChild(this.imageElement);
        this.wrapper.appendChild(imageContainer);
        
        // Welcome message
        this.messageElement = document.createElement("div");
        this.messageElement.className = "fr-message";
        this.messageElement.textContent = this.config.guestPrompt;
        this.wrapper.appendChild(this.messageElement);
        
        // Debug panel (if enabled)
        if (this.config.debug) {
            this.debugElement = document.createElement("div");
            this.debugElement.className = "fr-debug";
            this.debugElement.innerHTML = this.getDebugHTML();
            this.wrapper.appendChild(this.debugElement);
        }
        
        return this.wrapper;
    },
    
    // Escape HTML to prevent XSS from user-controlled data (e.g., profile names)
    escapeHTML: function(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },
    
    getDebugHTML: function() {
        const status = this.lastStatus || {};
        const profileCount = this.profiles.length;
        const timeSinceStatus = this.lastStatusTime 
            ? Math.round((Date.now() - this.lastStatusTime) / 1000) 
            : "—";
        const pythonStatus = this.lastStatusTime && timeSinceStatus < 5 
            ? "✓ Running" 
            : "⚠ No data";
        const pythonClass = this.lastStatusTime && timeSinceStatus < 5 
            ? "ok" 
            : "warn";
        
        const state = this.isSleeping 
            ? "😴 Sleeping" 
            : (this.isKnown ? "✓ Recognized" : "👤 Guest");
        
        const sleepTimeout = status.sleepTimeoutSecs || 300;
        // Check for null/undefined explicitly so 0 displays as "0s ago"
        const timeSinceFace = status.timeSinceFace != null
            ? Math.round(status.timeSinceFace) + "s ago"
            : "—";
        
        // Escape user-controlled values to prevent XSS
        const safeUser = this.escapeHTML(status.user) || "None";
        
        return `
            <div class="fr-debug-title">🔧 Debug Mode</div>
            <div class="fr-debug-grid">
                <div class="fr-debug-row">
                    <span class="fr-debug-label">Python Script:</span>
                    <span class="fr-debug-value ${pythonClass}">${pythonStatus}</span>
                </div>
                <div class="fr-debug-row">
                    <span class="fr-debug-label">Profiles Loaded:</span>
                    <span class="fr-debug-value">${profileCount}</span>
                </div>
                <div class="fr-debug-row">
                    <span class="fr-debug-label">Current State:</span>
                    <span class="fr-debug-value">${state}</span>
                </div>
                <div class="fr-debug-row">
                    <span class="fr-debug-label">Current User:</span>
                    <span class="fr-debug-value">${safeUser}</span>
                </div>
                <div class="fr-debug-row">
                    <span class="fr-debug-label">Last Face Seen:</span>
                    <span class="fr-debug-value">${timeSinceFace}</span>
                </div>
                <div class="fr-debug-row">
                    <span class="fr-debug-label">Sleep After:</span>
                    <span class="fr-debug-value">${sleepTimeout}s</span>
                </div>
                <div class="fr-debug-row">
                    <span class="fr-debug-label">Last Update:</span>
                    <span class="fr-debug-value">${timeSinceStatus}s ago</span>
                </div>
            </div>
        `;
    },
    
    updateDebugPanel: function() {
        if (this.debugElement) {
            this.debugElement.innerHTML = this.getDebugHTML();
        }
    },
    
    notificationReceived: function(notification, payload, sender) {
        switch (notification) {
            case "DOM_OBJECTS_CREATED":
                // Start polling for recognition status
                this.sendSocketNotification("START_RECOGNITION", {
                    interval: this.config.pollInterval
                });
                break;
                
            case "MODULE_DOM_CREATED":
                // Module is ready
                break;
        }
    },
    
    socketNotificationReceived: function(notification, payload) {
        switch (notification) {
            case "RECOGNITION_STATUS":
                this.lastStatus = payload;
                this.lastStatusTime = Date.now();
                this.handleRecognitionStatus(payload);
                break;
                
            case "PROFILES_LIST":
                this.profiles = payload;
                Log.info("[MMM-Facial-Recognition] Loaded profiles:", this.profiles);
                if (this.config.debug) {
                    this.updateDebugPanel();
                }
                break;
        }
    },
    
    handleRecognitionStatus: function(status) {
        // Grace period: ignore sleep mode for first 30 seconds after startup
        // This allows the Python script time to start and detect faces
        const STARTUP_GRACE_PERIOD = 30000; // 30 seconds
        const timeSinceStartup = Date.now() - this.startupTime;
        const inGracePeriod = timeSinceStartup < STARTUP_GRACE_PERIOD;
        
        // Mark as initialized after first valid status
        if (!this.isInitialized && !status.noData) {
            this.isInitialized = true;
            Log.info("[MMM-Facial-Recognition] Initialized with status:", status);
        }
        
        // During grace period, treat sleeping as awake (show guest mode)
        const effectivelySleeping = status.sleeping && !inGracePeriod;
        
        // Handle sleep mode changes
        if (effectivelySleeping !== this.isSleeping) {
            this.isSleeping = effectivelySleeping;
            this.updateSleepState();
        }
        
        // Always sync overlay state to prevent stuck overlay
        // This catches any edge cases where overlay state gets out of sync
        this.syncOverlayState();
        
        if (effectivelySleeping) {
            this.updateUI(null, false);
        } else {
            // Handle user changes
            if (status.user !== this.currentUser || status.isKnown !== this.isKnown) {
                this.currentUser = status.user;
                this.isKnown = status.isKnown;
                this.updateUI(status.user, status.isKnown, status.userImage);
            }
        }
        
        // Update debug panel
        if (this.config.debug) {
            this.updateDebugPanel();
        }
    },
    
    updateUI: function(user, isKnown, userImage) {
        if (!this.wrapper) return;
        
        // Remove previous state classes
        this.wrapper.classList.remove("fr-known", "fr-guest", "fr-sleeping");
        
        if (this.isSleeping) {
            // Sleep mode UI
            this.wrapper.classList.add("fr-sleeping");
            this.messageElement.textContent = this.config.sleepPrompt;
            this.imageElement.src = this.file("public/guest.gif");
            this.statusElement.innerHTML = '<span class="fr-status-dot sleeping"></span>Sleep Mode';
            
        } else if (user && isKnown) {
            // Known user
            this.wrapper.classList.add("fr-known");
            this.messageElement.textContent = `Welcome back, ${user}!`;
            
            if (userImage) {
                this.imageElement.src = userImage;
            }
            
            this.statusElement.innerHTML = '<span class="fr-status-dot active"></span>Recognized';
            
        } else {
            // Guest or unknown
            this.wrapper.classList.add("fr-guest");
            this.messageElement.textContent = this.config.guestPrompt;
            this.imageElement.src = this.file("public/guest.gif");
            this.statusElement.innerHTML = '<span class="fr-status-dot"></span>Guest Mode';
        }
    },
    
    updateSleepState: function() {
        if (!this.config.dimOnSleep) return;
        
        // Find the main MagicMirror container to dim everything
        const mmContainer = document.querySelector(".region-fullscreen-below") ||
                           document.querySelector("#wrapper") ||
                           document.body;
        
        if (this.isSleeping) {
            // Add sleep overlay or dim the display
            this.addSleepOverlay(mmContainer);
        } else {
            // Remove sleep overlay
            this.removeSleepOverlay(mmContainer);
        }
    },
    
    syncOverlayState: function() {
        // Ensure overlay state matches current sleep state
        // This prevents the overlay from getting "stuck" due to race conditions
        if (!this.config.dimOnSleep) return;
        
        const overlay = document.getElementById("fr-sleep-overlay");
        const overlayExists = overlay !== null && overlay.style.opacity !== "0";
        
        if (!this.isSleeping && overlayExists) {
            // We should be awake but overlay is still visible - force remove it
            Log.info("[MMM-Facial-Recognition] Forcing overlay removal - sync correction");
            this.forceRemoveOverlay();
        } else if (this.isSleeping && !overlayExists) {
            // We should be sleeping but overlay is missing - add it
            const mmContainer = document.querySelector(".region-fullscreen-below") ||
                               document.querySelector("#wrapper") ||
                               document.body;
            this.addSleepOverlay(mmContainer);
        }
    },
    
    forceRemoveOverlay: function() {
        // Immediately remove the overlay without animation
        const overlay = document.getElementById("fr-sleep-overlay");
        if (overlay && overlay.parentNode) {
            overlay.style.opacity = "0";
            overlay.parentNode.removeChild(overlay);
        }
    },
    
    addSleepOverlay: function(container) {
        // Check if overlay already exists
        let overlay = document.getElementById("fr-sleep-overlay");
        
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "fr-sleep-overlay";
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, ${1 - this.config.sleepDimLevel});
                z-index: 9999;
                pointer-events: none;
                transition: opacity ${this.config.animationSpeed}ms ease;
                opacity: 0;
            `;
            document.body.appendChild(overlay);
            
            // Trigger animation
            requestAnimationFrame(() => {
                overlay.style.opacity = "1";
            });
        } else if (overlay.style.opacity !== "1") {
            // Overlay exists but is fading out or invisible - animate it back to visible
            requestAnimationFrame(() => {
                overlay.style.opacity = "1";
            });
        }
    },
    
    removeSleepOverlay: function(container) {
        const overlay = document.getElementById("fr-sleep-overlay");
        
        if (overlay) {
            overlay.style.opacity = "0";
            
            setTimeout(() => {
                // Only remove if overlay is still faded out (not re-animated to visible)
                // This prevents race conditions when quickly transitioning between states
                if (overlay.parentNode && overlay.style.opacity === "0") {
                    overlay.parentNode.removeChild(overlay);
                }
            }, this.config.animationSpeed);
        }
    },
    
    suspend: function() {
        // Called when module is hidden
        this.sendSocketNotification("STOP_RECOGNITION", {});
    },
    
    resume: function() {
        // Called when module is shown again
        this.sendSocketNotification("START_RECOGNITION", {
            interval: this.config.pollInterval
        });
    }
});
