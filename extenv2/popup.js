let currentTabId = null;
let audioContext = null;
let source = null;
let analyser = null;
let isPlaying = false;
let pipWindow = null;

const canvas = document.getElementById('waveform');
const ctx = canvas.getContext('2d');
canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;

document.addEventListener('DOMContentLoaded', loadTabs);
window.addEventListener('focus', loadTabs);

document.getElementById('playPauseBtn').addEventListener('click', togglePlay);
document.getElementById('stopBtn').addEventListener('click', stopAudio);
document.getElementById('pipBtn').addEventListener('click', togglePiP);

async function loadTabs() {
  const tabs = await chrome.tabs.query({ audible: true });
  const tabsList = document.getElementById('tabs-list');
  tabsList.innerHTML = '';

  if (tabs.length === 0) {
    tabsList.innerHTML = '<p>Không có tab nào đang phát âm thanh.</p>';
    return;
  }

  tabs.forEach(tab => {
    const button = document.createElement('button');
    button.className = 'tab-button';
    button.innerHTML = `<strong>${tab.title}</strong><br><small>${new URL(tab.url).hostname}</small>`;
    button.addEventListener('click', () => selectTab(tab));
    tabsList.appendChild(button);
  });
}

async function selectTab(tab) {
  if (currentTabId === tab.id) return;
  if (currentTabId) await stopAudio();

  try {
    await chrome.tabs.update(tab.id, { muted: true });

    const stream = await new Promise((resolve, reject) => {
      chrome.tabCapture.capture({ audio: true, video: false }, stream => {
        if (chrome.runtime.lastError || !stream) {
          reject(new Error(chrome.runtime.lastError?.message || "Không thể capture tab này!"));
        } else {
          resolve(stream);
        }
      });
    });

    currentTabId = tab.id;
    setupAudio(stream);
    isPlaying = true;
    drawBars();
    activatePiP(); // Kích hoạt PiP khi capture thành công

  } catch (error) {
    console.error("Lỗi capture:", error);
    alert(error.message);
  }
}

function setupAudio(stream) {
  audioContext = new AudioContext();
  source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  
  analyser.fftSize = 256;
  source.connect(analyser);
  analyser.connect(audioContext.destination);
}

function togglePlay() {
  if (!audioContext) return;

  if (isPlaying) {
    audioContext.suspend();
  } else {
    audioContext.resume();
  }
  isPlaying = !isPlaying;
}

async function stopAudio() {
  if (currentTabId) {
    await chrome.tabs.update(currentTabId, { muted: false });
    currentTabId = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  isPlaying = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  deactivatePiP();
}

function drawBars() {
  if (!analyser || !isPlaying) {
    requestAnimationFrame(drawBars);
    return;
  }

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const barWidth = (canvas.width / bufferLength) * 2.5;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const barHeight = dataArray[i] / 2;
    
    ctx.fillStyle = `rgb(${barHeight + 100}, 50, 150)`;
    ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
    
    x += barWidth + 2;
  }

  requestAnimationFrame(drawBars);
}

// 📌 Tích hợp Picture-in-Picture (PiP)
function activatePiP() {
  if (!document.pictureInPictureEnabled) {
    console.warn("Trình duyệt không hỗ trợ Picture-in-Picture!");
    return;
  }

  if (pipWindow) return; // Nếu PiP đã bật, bỏ qua

  canvas.requestPictureInPicture()
    .then(window => {
      pipWindow = window;
      window.addEventListener('leavepictureinpicture', () => {
        pipWindow = null;
      });
    })
    .catch(error => console.error("Lỗi PiP:", error));
}

function deactivatePiP() {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture();
    pipWindow = null;
  }
}

// 📌 Nút bật/tắt PiP
function togglePiP() {
  if (pipWindow) {
    deactivatePiP();
  } else {
    activatePiP();
  }
}
