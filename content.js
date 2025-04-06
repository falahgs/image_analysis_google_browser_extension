// Create tooltip element
const tooltip = document.createElement('div');
tooltip.className = 'gemini-tooltip';
document.body.appendChild(tooltip);

// Create loading element
const loadingElement = document.createElement('div');
loadingElement.className = 'loading';
loadingElement.innerHTML = `
    <div class="loading-spinner"></div>
    <div class="loading-text">Analyzing image...</div>
`;
tooltip.appendChild(loadingElement);

// Create result container
const resultContainer = document.createElement('div');
resultContainer.className = 'result-container';
tooltip.appendChild(resultContainer);

// Create result element
const resultElement = document.createElement('div');
resultElement.className = 'result';
resultContainer.appendChild(resultElement);

// Create bottom container for copy button and copyright
const bottomContainer = document.createElement('div');
bottomContainer.className = 'bottom-container';
resultContainer.appendChild(bottomContainer);

// Create copy button
const copyButton = document.createElement('button');
copyButton.className = 'copy-button';
copyButton.innerHTML = `
    <svg class="copy-icon" viewBox="0 0 24 24">
        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
    </svg>
    Copy Analysis
`;
bottomContainer.appendChild(copyButton);

// Create copyright element
const copyrightElement = document.createElement('div');
copyrightElement.className = 'copyright';
copyrightElement.innerHTML = '© 2025 Falah G. Salieh <span class="arabic">(فلاح الخفاجي)</span>';
bottomContainer.appendChild(copyrightElement);

// Track hover state
let isTooltipHovered = false;
let activeImage = null;
let hideTimeout = null;

// Add hover listeners to tooltip
tooltip.addEventListener('mouseenter', () => {
    isTooltipHovered = true;
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
});

tooltip.addEventListener('mouseleave', () => {
    isTooltipHovered = false;
    hideTooltipWithDelay();
});

// Add copy functionality
copyButton.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(resultElement.textContent);
        copyButton.classList.add('copied');
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
            copyButton.classList.remove('copied');
            copyButton.innerHTML = `
                <svg class="copy-icon" viewBox="0 0 24 24">
                    <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                </svg>
                Copy Analysis
            `;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy text:', err);
    }
});

// Function to hide tooltip with delay
function hideTooltipWithDelay() {
    if (hideTimeout) {
        clearTimeout(hideTimeout);
    }
    hideTimeout = setTimeout(() => {
        if (!isTooltipHovered && activeImage !== document.activeElement) {
            tooltip.style.opacity = '0';
            setTimeout(() => {
                if (tooltip.style.opacity === '0') {
                    tooltip.style.display = 'none';
                }
            }, 200);
        }
    }, 300);
}

// Gemini API configuration
let GEMINI_API_KEY = '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Load API key from storage and listen for changes
function updateApiKey() {
    chrome.storage.sync.get(['geminiApiKey'], (result) => {
        GEMINI_API_KEY = result.geminiApiKey || '';
        console.log('API Key loaded:', GEMINI_API_KEY ? 'Present' : 'Missing');
    });
}

// Initial load of API key
updateApiKey();

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
    if (changes.geminiApiKey) {
        updateApiKey();
    }
});

// Function to validate API key
function validateApiKey() {
    if (!GEMINI_API_KEY) {
        throw new Error('Please set your Gemini API key in the extension settings');
    }
    if (GEMINI_API_KEY.length < 10) {
        throw new Error('Invalid API key format. Please check your API key');
    }
}

// Function to analyze image using Gemini
async function analyzeImage(imageUrl) {
    try {
        // Validate API key first
        validateApiKey();

        // Try different methods to fetch the image
        let base64Image;
        try {
            // First try: direct fetch
            const response = await fetch(imageUrl, {
                mode: 'cors',
                credentials: 'omit'
            });
            
            if (!response.ok) {
                throw new Error('Direct fetch failed');
            }

            const blob = await response.blob();
            base64Image = await blobToBase64(blob);
        } catch (fetchError) {
            console.log('Direct fetch failed, trying alternative method...', fetchError);
            
            // Second try: using IMG element
            base64Image = await getImageDataFromElement(imageUrl);
        }

        if (!base64Image) {
            throw new Error('Failed to load image data. The image might be protected or unavailable.');
        }

        const requestBody = {
            contents: [{
                parts: [{
                    text: "Analyze this image and provide a brief description."
                }, {
                    inline_data: {
                        mime_type: "image/jpeg",
                        data: base64Image
                    }
                }]
            }]
        };

        console.log('Sending request to Gemini API...');
        const result = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!result.ok) {
            const errorData = await result.json().catch(() => ({}));
            console.error('API Error:', result.status, errorData);
            throw new Error(`API request failed: ${result.status} - ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await result.json();
        if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
            throw new Error('Invalid response format from API');
        }

        // Add copyright information to the analysis
        const analysis = data.candidates[0].content.parts[0].text;
        const copyright = '\n\n© 2025 Falah G. Salieh (فلاح الخفاجي)\nGemini Image Analyzer';
        return analysis + copyright;

    } catch (error) {
        console.error('Error analyzing image:', error);
        if (error.message.includes('API key')) {
            return 'Please set a valid Gemini API key in the extension settings';
        }
        return `Error: ${error.message}. Please try a different image or check your connection.`;
    }
}

// Helper function to convert blob to base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Helper function to get image data using canvas
function getImageDataFromElement(imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                resolve(dataUrl.split(',')[1]);
            } catch (e) {
                reject(new Error('Failed to process image'));
            }
        };
        img.onerror = () => {
            // Try without crossOrigin as a last resort
            img.crossOrigin = '';
            img.src = imageUrl;
        };
        
        // Add timestamp to bypass cache
        const cacheBuster = new Date().getTime();
        img.src = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}_cb=${cacheBuster}`;
    });
}

// Handle image hover
let currentAnalysis = null;
document.addEventListener('mouseover', async (e) => {
    if (e.target.tagName === 'IMG') {
        // Skip tiny images or likely icons
        if (e.target.width < 50 || e.target.height < 50) {
            return;
        }

        activeImage = e.target;
        const img = e.target;
        const rect = img.getBoundingClientRect();
        
        // Calculate position for tooltip
        const tooltipWidth = 280;
        const padding = 20;
        
        // First try to position on the left
        let left = rect.left - tooltipWidth - padding;
        
        // If not enough space on the left, try the right side
        if (left < 0) {
            left = rect.right + padding;
            tooltip.classList.remove('right-arrow');
        } else {
            tooltip.classList.add('right-arrow');
        }

        // Position tooltip
        tooltip.style.left = `${left + window.scrollX}px`;
        tooltip.style.top = `${rect.top + window.scrollY}px`;
        
        // Show loading state
        loadingElement.style.display = 'flex';
        resultContainer.style.display = 'none';
        tooltip.style.opacity = '0';
        tooltip.style.display = 'block';
        
        // Fade in animation
        setTimeout(() => {
            tooltip.style.opacity = '1';
        }, 50);

        // Cancel previous analysis if it exists
        if (currentAnalysis) {
            currentAnalysis.abort();
        }

        // Create new AbortController for this analysis
        const controller = new AbortController();
        currentAnalysis = controller;

        try {
            const analysis = await analyzeImage(img.src);
            if (!controller.signal.aborted) {
                loadingElement.style.display = 'none';
                resultContainer.style.display = 'flex';
                resultElement.textContent = analysis;
                copyButton.style.display = analysis.startsWith('Error') ? 'none' : 'flex';
            }
        } catch (error) {
            if (!controller.signal.aborted) {
                loadingElement.style.display = 'none';
                resultContainer.style.display = 'flex';
                resultElement.textContent = `Error: ${error.message}`;
                copyButton.style.display = 'none';
            }
        }
    }
});

// Handle image mouseout
document.addEventListener('mouseout', (e) => {
    if (e.target.tagName === 'IMG') {
        activeImage = null;
        if (currentAnalysis) {
            currentAnalysis.abort();
            currentAnalysis = null;
        }
        hideTooltipWithDelay();
    }
}); 