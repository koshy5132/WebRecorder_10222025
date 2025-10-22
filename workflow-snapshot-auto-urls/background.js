// Workflow Snapshot Background Script - WITH AUTO URL LOADING
(function() {
  'use strict';
  
  let sessionId = null;
  let snapshots = [];
  let isRecording = false;
  let urlProcessingTabs = new Set();
  let availableUrls = []; // Store URLs loaded from urls.txt

  console.log("🔧 BACKGROUND: Service worker initialized - AUTO URL LOADING");

  // Load URLs from urls.txt on startup
  function loadUrlsFromFile() {
    console.log("📁 BACKGROUND: Attempting to load URLs from urls.txt");
    
    // In Chrome extensions, we need to use chrome.runtime.getURL to access files
    const url = chrome.runtime.getURL('urls.txt');
    
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to load urls.txt');
        }
        return response.text();
      })
      .then(text => {
        console.log("✅ BACKGROUND: Successfully loaded urls.txt");
        availableUrls = parseUrlsFromText(text);
        console.log("📋 BACKGROUND: Found", availableUrls.length, "URLs in file");
        
        // Store in storage for popup to access
        chrome.storage.local.set({ availableUrls: availableUrls });
      })
      .catch(error => {
        console.warn("⚠️ BACKGROUND: Could not load urls.txt:", error.message);
        availableUrls = [];
        chrome.storage.local.set({ availableUrls: [] });
      });
  }

  function parseUrlsFromText(text) {
    const urls = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#')) // Remove empty lines and comments
      .filter(line => {
        try {
          new URL(line);
          return true;
        } catch {
          console.warn("⚠️ BACKGROUND: Skipping invalid URL:", line);
          return false;
        }
      });
    
    return urls;
  }

  function getSessionId() {
    if (!sessionId) {
      sessionId = "session-" + Date.now();
      console.log("🆔 BACKGROUND: Generated new session ID:", sessionId);
    }
    return sessionId;
  }

  function stopAllProcesses() {
    console.log("🛑 BACKGROUND: stopAllProcesses() CALLED");
    console.log("🛑 BACKGROUND: Current state - isRecording:", isRecording, "urlProcessingTabs:", Array.from(urlProcessingTabs));
    
    isRecording = false;
    
    if (urlProcessingTabs.size > 0) {
      console.log("🔍 BACKGROUND: Closing", urlProcessingTabs.size, "URL processing tabs");
      const tabsToClose = Array.from(urlProcessingTabs);
      tabsToClose.forEach(tabId => {
        console.log("❌ BACKGROUND: Removing tab", tabId);
        urlProcessingTabs.delete(tabId);
        try {
          chrome.tabs.remove(tabId);
        } catch (err) {
          console.warn("⚠️ BACKGROUND: Could not remove tab", tabId, err && err.message);
        }
      });
    } else {
      console.log("✅ BACKGROUND: No URL processing tabs to close");
    }
    
    console.log("💾 BACKGROUND: Setting running=false in storage");
    chrome.storage.local.set({ 
      running: false
    }).then(() => {
      console.log("✅ BACKGROUND: Storage updated with running=false");
    }).catch(error => {
      console.error("❌ BACKGROUND: Error updating storage:", error);
    });
  }

  function captureScreenshot(msg) {
    console.log("📸 BACKGROUND: captureScreenshot() called with:", {
      action: msg.action,
      type: msg.isInitial ? "initial" : msg.isClick ? "click" : "url",
      url: msg.url,
      isRecording: isRecording
    });

    if (!isRecording) {
      console.log("❌ BACKGROUND: Not recording, ignoring capture");
      return;
    }

    chrome.tabs.captureVisibleTab(null, {format: "png"}, (dataUrl) => {
      console.log("🖼️ BACKGROUND: captureVisibleTab callback executed");
      
      if (chrome.runtime.lastError) {
        console.error("❌ BACKGROUND: Capture error:", chrome.runtime.lastError.message);
        return;
      }

      if (!dataUrl) {
        console.warn("❌ BACKGROUND: No data URL returned from capture");
        return;
      }

      if (!isRecording) {
        console.log("❌ BACKGROUND: Recording stopped during capture, ignoring");
        return;
      }

      const sid = getSessionId();
      const timestamp = Date.now();
      const type = msg.isInitial ? "initial" : (msg.isClick ? "click" : "url");
      const filename = sid + "/" + type + "-snapshot-" + timestamp + ".png";
      
      console.log("💾 BACKGROUND: Downloading screenshot:", filename);
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false
      });

      const snapshotData = {
        filename: filename,
        dataUrl: dataUrl,
        time: new Date().toLocaleTimeString(),
        date: new Date().toLocaleDateString(),
        timestamp: timestamp,
        x: msg.x || 0,
        y: msg.y || 0,
        type: type,
        url: msg.url || "Current tab"
      };

      snapshots.push(snapshotData);
      console.log("💾 BACKGROUND: Saving snapshot, total snapshots:", snapshots.length);
      chrome.storage.local.set({snapshots: snapshots});
      
      console.log("✅ BACKGROUND: Successfully captured", type, "snapshot");
    });
  }

  function processUrls(urlList) {
    console.log("🌐 BACKGROUND: processUrls() called with", urlList.length, "URLs");
    console.log("🌐 BACKGROUND: Current state - isRecording:", isRecording);

    if (!isRecording) {
      console.log("❌ BACKGROUND: Cannot process URLs - not recording");
      return;
    }

    function processUrl(index) {
      console.log("🌐 BACKGROUND: processUrl() called with index:", index);
      
      if (index >= urlList.length) {
        console.log("✅ BACKGROUND: URL processing completed - all URLs processed");
        console.log("🧹 BACKGROUND: URL processing tabs (kept open):", Array.from(urlProcessingTabs));
        urlProcessingTabs.clear();
        return;
      }

      if (!isRecording) {
        console.log("❌ BACKGROUND: Recording stopped during URL processing");
        urlProcessingTabs.clear();
        return;
      }

      const url = urlList[index];
      console.log("🌐 BACKGROUND: Processing URL " + (index + 1) + "/" + urlList.length + ": " + url);

      console.log("➕ BACKGROUND: Creating new tab for URL");
      chrome.tabs.create({ 
        url: url, 
        active: false 
      }, (tab) => {
        console.log("➕ BACKGROUND: Tab created result:", tab);
        
        if (!tab || !tab.id) {
          console.warn("❌ BACKGROUND: Failed to create tab for URL:", url);
          setTimeout(() => processUrl(index + 1), 1000);
          return;
        }

        console.log("📝 BACKGROUND: Tracking tab", tab.id, "for URL processing");
        urlProcessingTabs.add(tab.id);
        console.log("📝 BACKGROUND: Current tracked tabs:", Array.from(urlProcessingTabs));

        let tabLoadListener = null;
        let loadTimeout = null;

        tabLoadListener = function(tabId, info) {
          const status = info && info.status ? info.status : "undefined";
          console.log("🔍 BACKGROUND: Tab updated - ID:", tabId, "status:", status);
          
          if (tabId === tab.id && info && info.status === 'complete') {
            console.log("✅ BACKGROUND: Tab", tabId, "loaded completely");
            
            if (tabLoadListener) {
              chrome.tabs.onUpdated.removeListener(tabLoadListener);
            }
            if (loadTimeout) {
              clearTimeout(loadTimeout);
            }
            
            setTimeout(() => {
              if (!isRecording) {
                console.log("❌ BACKGROUND: Recording stopped, marking tab", tabId, "as done but keeping it open");
                if (urlProcessingTabs.has(tabId)) {
                  urlProcessingTabs.delete(tabId);
                  console.log("📝 BACKGROUND: Removed tab from tracking (kept tab open)");
                }
                setTimeout(() => processUrl(index + 1), 500);
                return;
              }

              console.log("📸 BACKGROUND: Capturing URL tab", tabId);
              chrome.tabs.captureVisibleTab(tab.windowId, {format: "png"}, (dataUrl) => {
                console.log("📸 BACKGROUND: URL capture callback for tab", tabId);
                
                if (dataUrl && isRecording) {
                  const sid = getSessionId();
                  const timestamp = Date.now();
                  const filename = sid + "/url-snapshot-" + timestamp + ".png";

                  console.log("💾 BACKGROUND: Downloading URL screenshot");
                  chrome.downloads.download({
                    url: dataUrl,
                    filename: filename,
                    saveAs: false
                  });

                  snapshots.push({
                    filename: filename,
                    dataUrl: dataUrl,
                    time: new Date().toLocaleTimeString(),
                    date: new Date().toLocaleDateString(),
                    timestamp: timestamp,
                    x: 0,
                    y: 0,
                    type: "url",
                    url: url
                  });

                  chrome.storage.local.set({snapshots: snapshots});
                  console.log("✅ BACKGROUND: URL snapshot captured: " + url);
                } else {
                  console.warn("⚠️ BACKGROUND: No dataUrl or recording stopped - skipping snapshot for tab", tabId);
                }

                if (urlProcessingTabs.has(tabId)) {
                  urlProcessingTabs.delete(tabId);
                  console.log("📝 BACKGROUND: Removed tab from tracking but kept tab open:", tabId);
                }

                setTimeout(() => processUrl(index + 1), 1000);
              });
            }, 2000);
          }
        };

        console.log("👂 BACKGROUND: Adding tab update listener for tab", tab.id);
        chrome.tabs.onUpdated.addListener(tabLoadListener);

        loadTimeout = setTimeout(() => {
          console.log("⏰ BACKGROUND: Tab load timeout check for tab", tab.id);
          if (tabLoadListener) {
            chrome.tabs.onUpdated.removeListener(tabLoadListener);
          }
          if (urlProcessingTabs.has(tab.id)) {
            console.log("❌ BACKGROUND: Tab load timeout, marking tab done and keeping it open:", tab.id);
            urlProcessingTabs.delete(tab.id);
            setTimeout(() => processUrl(index + 1), 1000);
          }
        }, 15000);
      });
    }

    console.log("🚀 BACKGROUND: Starting URL processing from index 0");
    processUrl(0);
  }

  function generateFinalReport() {
    console.log("📊 BACKGROUND: generateFinalReport() called");
    console.log("📊 BACKGROUND: Total snapshots:", snapshots.length);

    if (snapshots.length === 0) {
      console.log("❌ BACKGROUND: No snapshots to generate report");
      chrome.storage.local.set({ 
        running: false, 
        snapshots: []
      });
      return;
    }

    chrome.storage.local.get(["folderPrefix"], (data) => {
      const prefix = data.folderPrefix || "workflow";
      const sid = getSessionId();
      const folder = prefix + "-" + sid;

      console.log("📄 BACKGROUND: Generating HTML summary");
      let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Workflow Summary - Auto URLs</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; background: #f8f8f8; max-width: 1200px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 30px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .snapshot-card { margin-bottom: 25px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); background: #fff; }
    .snapshot-card img { max-width: 100%; border: 1px solid #ccc; border-radius: 4px; margin-top: 10px; }
    .step-info { background: #f5f5f5; padding: 10px; border-radius: 4px; margin: 10px 0; }
    .initial-badge { background: #4CAF50; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
    .click-badge { background: #ff4444; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
    .url-badge { background: #2196F3; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; }
    .stats { display: flex; justify-content: center; gap: 20px; margin: 20px 0; }
    .stat-item { background: #667eea; color: white; padding: 10px 20px; border-radius: 20px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Workflow Recording Summary - Auto URLs</h1>
    <div class="stats">
      <div class="stat-item">Total Steps: ${snapshots.length}</div>
      <div class="stat-item">Initial: ${snapshots.filter(s => s.type === 'initial').length}</div>
      <div class="stat-item">Clicks: ${snapshots.filter(s => s.type === 'click').length}</div>
      <div class="stat-item">URLs: ${snapshots.filter(s => s.type === 'url').length}</div>
    </div>
    <p>Session: ${folder} | Generated: ${new Date().toLocaleString()}</p>
    <p><strong>✅ URLs auto-loaded from urls.txt</strong></p>
  </div>`;

      snapshots.forEach(function(snapshot, index) {
        const badge = snapshot.type === 'initial' ? 
          '<span class="initial-badge">INITIAL</span>' : 
          snapshot.type === 'click' ? 
          '<span class="click-badge">CLICK</span>' : 
          '<span class="url-badge">URL</span>';
        
        const urlInfo = snapshot.url && snapshot.url !== "Current tab" ? 
          '<div style="background: #e3f2fd; padding: 8px; border-radius: 4px; margin: 5px 0; font-size: 0.9em;"><strong>URL:</strong> ' + snapshot.url + '</div>' : '';
        
        const clickInfo = snapshot.type === 'click' ? 
          '<div style="background: #ffebee; padding: 8px; border-radius: 4px; margin: 5px 0; font-size: 0.9em;"><strong>Click Position:</strong> (' + snapshot.x + ', ' + snapshot.y + ')</div>' : '';

        html += `
        <div class="snapshot-card">
          <h3>Step ${index + 1} ${badge}</h3>
          <div class="step-info">
            <p><strong>Time:</strong> ${snapshot.time}</p>
            <p><strong>Date:</strong> ${snapshot.date}</p>
            ${clickInfo}
            ${urlInfo}
          </div>
          <img src="${snapshot.dataUrl}" alt="Step ${index + 1} screenshot">
          <p><small><strong>File:</strong> ${snapshot.filename}</small></p>
        </div>`;
      });
      
      html += '</body></html>';
      
      const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(html);
      const filename = folder + "/workflow-summary.html";
      
      console.log("💾 BACKGROUND: Downloading HTML report");
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false
      }, (downloadId) => {
        console.log("✅ BACKGROUND: HTML report download started, ID:", downloadId);
        
        console.log("🔄 BACKGROUND: Resetting extension state");
        snapshots = [];
        sessionId = null;
        urlProcessingTabs.clear();
        chrome.storage.local.set({
          running: false, 
          snapshots: []
        }).then(() => {
          console.log("✅ BACKGROUND: Extension state reset complete");
        });
      });
    });
  }

  // Message handler
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log("📨 BACKGROUND: Message received:", msg.action || msg.type);

    if (msg.action === "captureScreenshot") {
      captureScreenshot(msg);
      sendResponse({success: true});
    }
    else if (msg.action === "stopRecording" || msg.type === "STOP_RECORDING") {
      console.log("🛑 BACKGROUND: Stop recording command received");
      stopAllProcesses();
      generateFinalReport();
      sendResponse({success: true});
    }
    else if (msg.action === "startRecording" || msg.type === "START_RECORDING") {
      console.log("🎬 BACKGROUND: Start recording command received");
      
      isRecording = true;
      sessionId = "session-" + Date.now();
      snapshots = [];
      urlProcessingTabs.clear();
      
      console.log("🎬 BACKGROUND: New state - isRecording:", true, "sessionId:", sessionId);
      
      chrome.storage.local.set({ 
        running: true,
        snapshots: []
      });
      
      console.log("✅ BACKGROUND: Recording started successfully");
      sendResponse({success: true, sessionId: sessionId});
    }
    else if (msg.action === "processUrls" || msg.type === "PROCESS_URLS") {
      const urls = msg.urls || msg.urlsToProcess || [];
      if (!isRecording) {
        sendResponse({success: false, error: "Not recording"});
        return;
      }
      if (urls.length === 0) {
        sendResponse({success: false, error: "No URLs provided"});
        return;
      }
      processUrls(urls);
      sendResponse({success: true});
    }
    else if (msg.action === "getAvailableUrls") {
      // Return URLs loaded from urls.txt
      sendResponse({success: true, urls: availableUrls});
    }
    else if (msg.action === "processSelectedUrls") {
      const selectedUrls = msg.selectedUrls || [];
      if (!isRecording) {
        sendResponse({success: false, error: "Not recording"});
        return;
      }
      if (selectedUrls.length === 0) {
        sendResponse({success: false, error: "No URLs selected"});
        return;
      }
      processUrls(selectedUrls);
      sendResponse({success: true});
    }
  });

  // Initialize state and load URLs on startup
  chrome.storage.local.get(["running"], (data) => {
    isRecording = data.running || false;
    console.log("🔧 BACKGROUND: Initialized with isRecording:", isRecording);
    
    // Load URLs from file on startup
    loadUrlsFromFile();
  });

  // Tab removal listener
  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log("❌ TAB REMOVED: Tab", tabId, "was closed");
    const wasOurTab = urlProcessingTabs.has(tabId);
    console.log("❌ TAB REMOVED: Was this our URL processing tab?", wasOurTab);
    
    if (wasOurTab) {
      urlProcessingTabs.delete(tabId);
      console.log("❌ TAB REMOVED: Removed from urlProcessingTabs set");
    }
  });

  console.log("✅ BACKGROUND: Service worker setup complete - AUTO URL LOADING");
})();