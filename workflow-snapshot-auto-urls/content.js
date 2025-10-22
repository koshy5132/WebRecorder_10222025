// Workflow Snapshot Content Script - FULL
(function() {
  'use strict';
  
  let running = false;
  let lastCapture = 0;

  function handleClick(e) {
    if (!running) return;
    
    const now = Date.now();
    if (now - lastCapture < 500) return;
    lastCapture = now;

    try {
      // Create click indicator
      const circle = document.createElement("div");
      Object.assign(circle.style, {
        position: "fixed",
        left: (e.clientX - 20) + "px",
        top: (e.clientY - 20) + "px",
        width: "40px",
        height: "40px",
        border: "3px solid #ff4444",
        borderRadius: "50%",
        zIndex: "999999",
        pointerEvents: "none",
        animation: "pulse 1.5s infinite"
      });

      if (document.body) {
        document.body.appendChild(circle);
        setTimeout(() => {
          if (circle.parentNode) circle.remove();
        }, 600);
      }
      
      // Capture screenshot for click
      chrome.runtime.sendMessage({
        action: "captureScreenshot",
        x: e.clientX,
        y: e.clientY,
        isClick: true,
        url: window.location.href
      });
    } catch (error) {
      console.warn("Workflow Snapshot: Click handler error", error);
    }
  }

  // Storage change listener
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes.running) {
      running = changes.running.newValue;
      
      if (running) {
        document.addEventListener("click", handleClick, true);
        
        // Send initial snapshot
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: "captureScreenshot",
            x: 0,
            y: 0,
            isInitial: true,
            url: window.location.href
          });
        }, 1000);
      } else {
        document.removeEventListener("click", handleClick, true);
      }
    }
  });

  // Initialize state
  chrome.storage.local.get(["running"], (data) => {
    running = data.running || false;
    if (running) {
      document.addEventListener("click", handleClick, true);
    }
  });

  // Add pulse animation
  if (!document.getElementById('workflow-pulse-style')) {
    const pulseStyle = document.createElement('style');
    pulseStyle.id = 'workflow-pulse-style';
    pulseStyle.textContent = `
      @keyframes pulse {
        0% { transform: scale(0.8); opacity: 1; }
        70% { transform: scale(1); opacity: 0.7; }
        100% { transform: scale(0.8); opacity: 0; }
      }
    `;
    document.head.appendChild(pulseStyle);
  }
})();