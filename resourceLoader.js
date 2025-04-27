const percentageText = document.querySelector('.loading-percentage');
// Get the start button element
const startButton = document.querySelector('.start-button'); 
const loadingText = document.querySelector('.loading-text');

// 更新进度
function updateProgress() {
    if (loadedCount === totalResources) {
        loadingText.textContent = '加载完成！';
        // Show the start button instead of the text
        if (startButton) { 
            startButton.classList.remove('hidden');
        }
        // startText.classList.remove('hidden'); // Keep or remove this line based on desired UI
        resolve(loadedResources); // 解析 Promise 并传递加载的资源
    }
} 