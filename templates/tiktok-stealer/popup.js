const loginScreen = document.getElementById('loginScreen');
const trialScreen = document.getElementById('trialScreen');
const checkLoginBtn = document.getElementById('checkLoginBtn');
const activateBtn = document.getElementById('activateBtn');
const timerDisplay = document.getElementById('timer');
const progressBar = document.getElementById('progressBar');
const usernameDisplay = document.getElementById('username');
const followersDisplay = document.getElementById('followers');

let trialEndTime = null;

// Load saved state
chrome.storage.local.get(['trialEndTime', 'userData'], (result) => {
  if (result.trialEndTime && result.userData) {
    trialEndTime = result.trialEndTime;
    showTrialScreen(result.userData);
  }
});

// Check login button
checkLoginBtn.addEventListener('click', async () => {
  checkLoginBtn.textContent = 'Checking...';
  checkLoginBtn.disabled = true;
  
  try {
    const userData = await checkTikTokLogin();
    
    if (userData) {
      // Set trial timer (2 hours from now)
      trialEndTime = Date.now() + (2 * 60 * 60 * 1000);
      
      chrome.storage.local.set({
        trialEndTime: trialEndTime,
        userData: userData
      });
      
      showTrialScreen(userData);
    } else {
      alert('❌ Please log in to TikTok first!\n\nClick "Open TikTok Login" below.');
      checkLoginBtn.textContent = 'Check Login Status';
      checkLoginBtn.disabled = false;
    }
  } catch (error) {
    alert('Connection error. Please try again.');
    checkLoginBtn.textContent = 'Check Login Status';
    checkLoginBtn.disabled = false;
  }
});

// Activate trial button
activateBtn.addEventListener('click', () => {
  activateBtn.textContent = '✓ Trial Activated!';
  activateBtn.style.background = '#22c55e';
  activateBtn.style.color = '#fff';
  
  setTimeout(() => {
    window.close();
  }, 1500);
});

async function checkTikTokLogin() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'checkLogin' }, (response) => {
      resolve(response);
    });
  });
}

function showTrialScreen(userData) {
  loginScreen.classList.add('hidden');
  trialScreen.classList.remove('hidden');
  
  usernameDisplay.textContent = '@' + (userData.username || 'user');
  followersDisplay.textContent = (userData.followers || '0').toLocaleString();
  
  startTimer();
  startProgress();
}

function startTimer() {
  function updateTimer() {
    const now = Date.now();
    const remaining = Math.max(0, trialEndTime - now);
    
    if (remaining === 0) {
      activateBtn.disabled = false;
      activateBtn.textContent = 'Activate Free Trial';
      timerDisplay.textContent = '00:00:00';
      return;
    }
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    
    timerDisplay.textContent = 
      String(hours).padStart(2, '0') + ':' +
      String(minutes).padStart(2, '0') + ':' +
      String(seconds).padStart(2, '0');
    
    setTimeout(updateTimer, 1000);
  }
  
  updateTimer();
}

function startProgress() {
  let progress = 0;
  
  const interval = setInterval(() => {
    progress += Math.random() * 15;
    
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
    }
    
    progressBar.style.width = progress + '%';
  }, 800);
}