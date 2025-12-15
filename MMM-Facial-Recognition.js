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
        sleepDimLevel: 0.1            // Opacity when sleeping (0-1)
    },
    
    // Module state
    currentUser: null,
    isKnown: false,
    isSleeping: false,
    profiles: [],
    
    // DOM references
    wrapper: null,
    imageElement: null,
    messageElement: null,
    statusElement: null,
    
    start: function() {
        Log.info("[MMM-Facial-Recognition] Starting module...");
        
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
        this.imageElement.style.width = this.config.width;
        imageContainer.appendChild(this.imageElement);
        this.wrapper.appendChild(imageContainer);
        
        // Welcome message
        this.messageElement = document.createElement("div");
        this.messageElement.className = "fr-message";
        this.messageElement.textContent = this.config.guestPrompt;
        this.wrapper.appendChild(this.messageElement);
        
        return this.wrapper;
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
                this.handleRecognitionStatus(payload);
                break;
                
            case "PROFILES_LIST":
                this.profiles = payload;
                Log.info("[MMM-Facial-Recognition] Loaded profiles:", this.profiles);
                break;
        }
    },
    
    handleRecognitionStatus: function(status) {
        // Handle sleep mode changes
        if (status.sleeping !== this.isSleeping) {
            this.isSleeping = status.sleeping;
            this.updateSleepState();
        }
        
        if (status.sleeping) {
            this.updateUI(null, false);
            return;
        }
        
        // Handle user changes
        if (status.user !== this.currentUser || status.isKnown !== this.isKnown) {
            this.currentUser = status.user;
            this.isKnown = status.isKnown;
            this.updateUI(status.user, status.isKnown, status.userImage);
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
        }
    },
    
    removeSleepOverlay: function(container) {
        const overlay = document.getElementById("fr-sleep-overlay");
        
        if (overlay) {
            overlay.style.opacity = "0";
            
            setTimeout(() => {
                if (overlay.parentNode) {
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
