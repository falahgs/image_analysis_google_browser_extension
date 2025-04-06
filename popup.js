document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('saveButton');
    const statusDiv = document.getElementById('status');

    // Load saved API key
    chrome.storage.sync.get(['geminiApiKey'], (result) => {
        if (result.geminiApiKey) {
            apiKeyInput.value = result.geminiApiKey;
            showStatus('API key is set', 'success');
        }
    });

    // Enable/disable save button based on input
    apiKeyInput.addEventListener('input', () => {
        const apiKey = apiKeyInput.value.trim();
        saveButton.disabled = apiKey.length < 10;
    });

    // Save API key
    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            showStatus('Please enter an API key', 'error');
            return;
        }

        if (apiKey.length < 10) {
            showStatus('API key seems too short. Please check it', 'error');
            return;
        }

        // Save to storage
        chrome.storage.sync.set({ geminiApiKey: apiKey }, () => {
            if (chrome.runtime.lastError) {
                showStatus('Error saving API key: ' + chrome.runtime.lastError.message, 'error');
            } else {
                showStatus('API key saved successfully!', 'success');
                
                // Notify all tabs that the API key has been updated
                chrome.tabs.query({}, (tabs) => {
                    tabs.forEach(tab => {
                        chrome.tabs.sendMessage(tab.id, { type: 'API_KEY_UPDATED' })
                            .catch(() => {}); // Ignore errors for inactive tabs
                    });
                });
            }
        });
    });

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
        }
    }
}); 