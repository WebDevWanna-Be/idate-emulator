const tabs = document.querySelectorAll('.tab-btn');
const views = document.querySelectorAll('.view');

const startBtn = document.getElementById('start-btn');
const logOutput = document.getElementById('log-output');
const saveLogBtn = document.getElementById('save-log-btn');

const charNameInput = document.getElementById('char-name');
const genderSelect   = document.getElementById('gender');
const honeyNameInput = document.getElementById('honey-name');
const eventSelect    = document.getElementById('event-id');

let currentState = 'start';
let logBuffer = [];

if (window.emu && window.emu.onInitSettings) {
  window.emu.onInitSettings((settings) => {
    if (charNameInput)  charNameInput.value  = settings.characterName || '';
    if (genderSelect)   genderSelect.value   = String(settings.gender ?? 2);
    if (honeyNameInput) honeyNameInput.value = settings.honeyName || '';
    if (eventSelect)    eventSelect.value    = String(settings.eventId ?? 0);
  });
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const viewId = tab.getAttribute('data-view');

    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    views.forEach(v => {
      if (v.id === viewId) v.classList.add('active');
      else v.classList.remove('active');
    });
  });
});

function addLog(message) {
  const time = new Date().toLocaleTimeString();
  const line = `[${time}] ${message}`;
  logBuffer.push(line);

  const el = document.createElement('div');
  el.className = 'log-line';
  el.textContent = line;
  logOutput.appendChild(el);
  logOutput.scrollTop = logOutput.scrollHeight;
}

if (window.emu && window.emu.onLogLine) {
  window.emu.onLogLine((line) => {
    const time = new Date().toLocaleTimeString();
    const formatted = `[${time}] ${line}`;
    logBuffer.push(formatted);

    const el = document.createElement('div');
    el.className = 'log-line';
    el.textContent = formatted;
    logOutput.appendChild(el);
    logOutput.scrollTop = logOutput.scrollHeight;
  });
}

function applyState() {
  startBtn.classList.remove('state-start', 'state-starting', 'state-stop');

  if (currentState === 'start') {
    startBtn.textContent = 'START';
    startBtn.classList.add('state-start');
    saveLogBtn.classList.add('hidden');
  } else if (currentState === 'starting') {
    startBtn.textContent = 'STARTING';
    startBtn.classList.add('state-starting');
    saveLogBtn.classList.add('hidden');
  } else if (currentState === 'stop') {
    startBtn.textContent = 'STOP';
    startBtn.classList.add('state-stop');
    saveLogBtn.classList.remove('hidden');
  }
}

startBtn.addEventListener('click', async () => {
  if (!window.emu) {
    addLog('IPC bridge (window.emu) not available.');
    return;
  }

  if (currentState === 'start') {
    currentState = 'starting';
    applyState();
    addLog('Emulator starting...');

    try {
      const result = await window.emu.startServer();
      if (!result || result.ok === false) {
        const errMsg = result && result.error ? result.error : 'Unknown error';
        addLog(`Emulator failed to start: ${errMsg}`);
        currentState = 'start';
        applyState();
        return;
      }

      currentState = 'stop';
      applyState();
      addLog('Emulator started.');
    } catch (err) {
      addLog('Emulator failed to start (IPC error): ' + (err.message || err));
      currentState = 'start';
      applyState();
    }
  } else if (currentState === 'stop') {
    addLog('Emulator stopping...');
    try {
      const result = await window.emu.stopServer();
      if (!result || result.ok === false) {
        const errMsg = result && result.error ? result.error : 'Unknown error';
        addLog(`Emulator failed to stop: ${errMsg}`);
      } else {
        addLog('Emulator stopped.');
      }
    } catch (err) {
      addLog('Emulator failed to stop (IPC error): ' + (err.message || err));
    }
    currentState = 'start';
    applyState();
  }
});

saveLogBtn.addEventListener('click', () => {
  if (logBuffer.length === 0) {
    addLog('No log to save.');
    return;
  }

  const allText = logBuffer.join('\n');
  console.log('LOG CONTENT TO SAVE:\n' + allText);
  addLog('Save requested (file saving not implemented yet).');
});

function pushSettings() {
  if (!window.emu || !window.emu.sendSettings) return;

  const settings = {
    characterName: charNameInput.value || '[DEV]Kijuwoo~',
    gender: Number(genderSelect.value) || 2,
    honeyName: honeyNameInput.value || '',
    eventId: Number(eventSelect.value) || 0,
  };
  window.emu.sendSettings(settings);
}

if (charNameInput) charNameInput.addEventListener('input', pushSettings);
if (genderSelect) genderSelect.addEventListener('change', pushSettings);
if (honeyNameInput) honeyNameInput.addEventListener('input', pushSettings);
if (eventSelect) eventSelect.addEventListener('change', pushSettings);

applyState();
