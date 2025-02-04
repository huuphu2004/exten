let currentTabId = null;
let audioContext = null;
let source = null;
let analyser = null;
let isPlaying = false;
let pipVideo = null;
let isPiPActive = false;

const canvas = document.getElementById('waveform');
const ctx = canvas.getContext('2d');
canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;

document.addEventListener('DOMContentLoaded', loadTabs);
window.addEventListener('focus', loadTabs);

document.getElementById('startBtn').addEventListener('click', togglePlay);
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

    // Không reset canvas khi chuyển tab
    drawBars();

  } catch (error) {
    console.error("Lỗi capture:", error);
    alert(error.message);
  }
}

function setupAudio(stream) {
  if (audioContext) {
    audioContext.close(); // Đóng AudioContext cũ nếu tồn tại
  }
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
  // if (currentTabId) {
  //   await chrome.tabs.update(currentTabId, { muted: false });
  //   currentTabId = null;
  // }
  // if (audioContext) {
  //   audioContext.close();
  //   audioContext = null;
  // }
  // isPlaying = false;
  // Không xóa canvas khi dừng audio
}

function drawBars() {
  if (!analyser || !isPlaying) {
    requestAnimationFrame(drawBars);
    return;
  }

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  // Không xóa toàn bộ canvas, chỉ vẽ đè lên
  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // Tạo hiệu ứng mờ dần
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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

// 📌 Tích hợp Picture-in-Picture (PiP) cho canvas
async function togglePiP() {
  try {
    if (isPiPActive) {
      await document.exitPictureInPicture();
      if (pipVideo) {
        pipVideo.remove();
        pipVideo = null;
      }
      isPiPActive = false;
    } else {
      if (!pipVideo) {
        pipVideo = document.createElement('video');
        pipVideo.muted = true; // Tắt âm thanh vì stream chỉ có hình ảnh
        pipVideo.srcObject = canvas.captureStream(60); // Lấy stream từ canvas
      }
      
      // Kích hoạt PiP khi video đã sẵn sàng
      pipVideo.addEventListener('loadedmetadata', async () => {
        try {
          await pipVideo.play();
          await pipVideo.requestPictureInPicture();
          isPiPActive = true; // Đánh dấu PiP đang hoạt động
        } catch (error) {
          console.error("Lỗi PiP:", error);
        }
      });
    }
  } catch (error) {
    console.error("Lỗi PiP:", error);
  }
}

// Giữ PiP hoạt động khi extension bị tắt (Hoạt động độc lập với việc đóng extension)
chrome.runtime.onSuspend.addListener(() => {
  // Đảm bảo PiP vẫn hoạt động ngay cả khi extension không còn hoạt động
  if (isPiPActive && pipVideo) {
    pipVideo.play(); // Tiếp tục phát video
    pipVideo.requestPictureInPicture(); // Yêu cầu PiP nếu chưa có
  }
});
