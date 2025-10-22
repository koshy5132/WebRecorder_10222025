// Workflow Snapshot Popup Script - WITH AUTO URL SELECTION
(function() {
  'use strict';
  
  const folderInput = document.getElementById("folderPrefix");
  const startBtn = document.getElementById("startBtn");
  const stopBtn = document.getElementById("stopBtn");
  const processUrlsBtn = document.getElementById("processUrlsBtn");
  const processSelectedBtn = document.getElementById("processSelectedBtn");
  const urlsInput = document.getElementById("urlsInput");
  const addListBtn = document.getElementById("addListBtn");
  const urlList = document.getElementById("urlList");
  const availableUrlsList = document.getElementById("availableUrlsList");
  const selectAllBtn = document.getElementById("selectAllBtn");
  const selectNoneBtn = document.getElementById("selectNoneBtn");
  const statusDiv = document.getElementById("status");

  let urls = []; // Manual URLs
  let availableUrls = []; // URLs from urls.txt
  let selectedUrls = new Set(); // Selected URLs from available list
  let isRecording = false;

  function updateStatus(recording) {
    isRecording = recording;
    if (isRecording) {
      statusDiv.textContent = "● Recording... Browser stays open";
      statusDiv.className = "status recording";
      startBtn.disabled = true;
      stopBtn.disabled = false;
      processUrlsBtn.disabled = urls.length === 0;
      processSelectedBtn.disabled = selectedUrls.size === 0;
    } else {
      statusDiv.textContent = "Ready";
      statusDiv.className = "status idle";
      startBtn.disabled = false;
      stopBtn.disabled = true;
      processUrlsBtn.disabled = true;
      processSelectedBtn.disabled = true;
    }
  }

  function showNotification(message) {
    console.log("Workflow Snapshot:", message);
    // Optional: Add toast notification
  }

  // Render manual URL list (existing functionality)
  function renderUrlList() {
    urlList.innerHTML = "";
    if (urls.length === 0) {
      urlList.innerHTML = '<div style="text-align: center; color: #666; padding: 10px;">No manual URLs added</div>';
      return;
    }
    
    urls.forEach((u) => {
      const div = document.createElement("div");
      div.className = "url-item";
      const span = document.createElement("div");
      span.className = "url-text";
      span.textContent = u;
      span.title = u;
      const btn = document.createElement("button");
      btn.className = "delete-btn";
      btn.textContent = "❌";
      btn.addEventListener("click", () => {
        urls = urls.filter(x => x !== u);
        chrome.storage.local.set({urls});
        renderUrlList();
        updateStatus(isRecording);
      });
      div.appendChild(span);
      div.appendChild(btn);
      urlList.appendChild(div);
    });
  }

  // NEW: Render available URLs from urls.txt with checkboxes
  function renderAvailableUrlsList() {
    availableUrlsList.innerHTML = "";
    
    if (availableUrls.length === 0) {
      availableUrlsList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">No URLs found in urls.txt or file not accessible</div>';
      return;
    }
    
    availableUrls.forEach((url, index) => {
      const div = document.createElement("div");
      div.className = "url-checkbox-item";
      
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "url-checkbox";
      checkbox.id = "url-" + index;
      checkbox.checked = selectedUrls.has(url);
      checkbox.addEventListener("change", (e) => {
        if (e.target.checked) {
          selectedUrls.add(url);
        } else {
          selectedUrls.delete(url);
        }
        updateSelectedCount();
        updateStatus(isRecording);
      });
      
      const label = document.createElement("label");
      label.className = "url-label";
      label.htmlFor = "url-" + index;
      label.textContent = url;
      label.title = url;
      
      div.appendChild(checkbox);
      div.appendChild(label);
      availableUrlsList.appendChild(div);
    });
    
    updateSelectedCount();
  }

  function updateSelectedCount() {
    const count = selectedUrls.size;
    processSelectedBtn.textContent = `Process Selected URLs (${count})`;
  }

  // NEW: Load available URLs from background
  function loadAvailableUrls() {
    chrome.runtime.sendMessage({ action: "getAvailableUrls" }, (response) => {
      if (response && response.success) {
        availableUrls = response.urls || [];
        console.log("Loaded", availableUrls.length, "URLs from urls.txt");
        renderAvailableUrlsList();
      } else {
        console.warn("Failed to load URLs from urls.txt");
        availableUrls = [];
        renderAvailableUrlsList();
      }
    });
  }

  function loadUrls() {
    chrome.storage.local.get(["urls", "running"], (data) => {
      urls = data.urls || [];
      renderUrlList();
      updateStatus(data.running || false);
    });
  }

  function isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Event Listeners
  addListBtn.addEventListener("click", () => {
    const text = urlsInput.value.trim();
    if (!text) return alert("Enter URLs first");
    const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const valid = lines.filter(isValidUrl);
    if (valid.length === 0) return alert("No valid URLs found. Include http:// or https://");
    urls = Array.from(new Set([...urls, ...valid]));
    chrome.storage.local.set({urls}, () => {
      urlsInput.value = "";
      renderUrlList();
      updateStatus(isRecording);
      showNotification("URLs added to manual list");
    });
  });

  selectAllBtn.addEventListener("click", () => {
    availableUrls.forEach(url => selectedUrls.add(url));
    renderAvailableUrlsList();
    updateStatus(isRecording);
  });

  selectNoneBtn.addEventListener("click", () => {
    selectedUrls.clear();
    renderAvailableUrlsList();
    updateStatus(isRecording);
  });

  processSelectedBtn.addEventListener("click", () => {
    const selected = Array.from(selectedUrls);
    if (selected.length === 0) return alert("No URLs selected from urls.txt");
    
    chrome.runtime.sendMessage({ 
      action: "processSelectedUrls", 
      selectedUrls: selected 
    }, (response) => {
      if (chrome.runtime.lastError) {
        alert("Error starting URL processing");
      } else if (response && !response.success) {
        alert(response.error || "Failed to process selected URLs");
      } else {
        showNotification("Processing " + selected.length + " selected URLs...");
      }
    });
  });

  processUrlsBtn.addEventListener("click", () => {
    if (urls.length === 0) return alert("No manual URLs to process");
    chrome.runtime.sendMessage({ action: "processUrls", urls }, (response) => {
      if (chrome.runtime.lastError) {
        alert("Error starting URL processing");
      } else if (response && !response.success) {
        alert(response.error || "Failed to process URLs");
      } else {
        showNotification("Processing " + urls.length + " manual URLs...");
      }
    });
  });

  startBtn.addEventListener("click", () => {
    const prefix = folderInput.value.trim() || "workflow";
    chrome.runtime.sendMessage({ action: "startRecording" }, (response) => {
      if (chrome.runtime.lastError) {
        alert("Error starting recording: " + chrome.runtime.lastError.message);
        return;
      }
      if (response && response.success) {
        chrome.storage.local.set({ folderPrefix: prefix });
        updateStatus(true);
        showNotification("Recording started");
      } else {
        alert("Failed to start recording");
      }
    });
  });

  stopBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "stopRecording" }, (response) => {
      if (chrome.runtime.lastError) {
        alert("Error stopping recording");
      } else {
        alert("Recording stopped. Generating HTML summary...");
        updateStatus(false);
      }
    });
  });

  // Initialize
  loadUrls();
  loadAvailableUrls(); // NEW: Load URLs from file

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local") {
      if (changes.running) {
        updateStatus(changes.running.newValue);
      }
      if (changes.urls) {
        loadUrls();
      }
      if (changes.availableUrls) {
        availableUrls = changes.availableUrls.newValue || [];
        renderAvailableUrlsList();
      }
    }
  });
})();