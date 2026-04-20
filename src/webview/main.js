(function() {
  console.log('[OCC] Script loaded');

  const vscode = acquireVsCodeApi();
  const messagesDiv = document.getElementById('messages');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const sessionSelect = document.getElementById('session-select');
  const newSessionBtn = document.getElementById('new-session');
  const renameSessionBtn = document.getElementById('rename-session');
  const deleteSessionBtn = document.getElementById('delete-session');

  let currentMessage = '';
  let isResponding = false;
  let projectFiles = [];
  let fileIndex = new Map();
  let sessions = [];
  let activeSessionId = '';
  let currentResponseNotices = [];

  function autoResizeInput() {
    input.style.height = 'auto';
    const newHeight = Math.min(Math.max(input.scrollHeight, 60), 300);
    input.style.height = newHeight + 'px';
  }

  function appendUniqueNotice(notice) {
    const trimmedNotice = String(notice || '').trim();
    if (!trimmedNotice || currentResponseNotices.includes(trimmedNotice)) {
      return;
    }

    currentResponseNotices.push(trimmedNotice);
  }

  function composeAssistantDisplayContent() {
    const trimmedMessage = currentMessage.trim();
    const notices = currentResponseNotices.map(notice => notice.trim()).filter(Boolean);

    if (trimmedMessage && notices.length > 0) {
      return `${trimmedMessage}\n\n---\n\n${notices.join('\n\n')}`;
    }

    if (trimmedMessage) {
      return trimmedMessage;
    }

    return notices.join('\n\n');
  }

  function buildFileIndex() {
    fileIndex.clear();
    projectFiles.forEach(file => {
      const basename = file.split('/').pop();
      if (!fileIndex.has(basename)) {
        fileIndex.set(basename, []);
      }
      fileIndex.get(basename).push(file);
    });
    console.log('[OCC] File index built:', projectFiles.length, 'files');
  }

  function findFile(text) {
    if (!text) {
      return null;
    }

    if (projectFiles.includes(text)) {
      return text;
    }

    const matches = fileIndex.get(text);
    if (matches && matches.length > 0) {
      return matches[0];
    }

    return null;
  }

  function isSearchableSymbol(text) {
    if (!text) {
      return false;
    }

    if (text.length > 120) {
      return false;
    }

    if (/\s/.test(text)) {
      return false;
    }

    return /[A-Za-z_./-]/.test(text);
  }

  function getCodeSearchQuery(preElement) {
    const codeElement = preElement.querySelector('code');
    if (!codeElement) {
      return '';
    }

    const lines = codeElement.textContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line);

    const firstUsefulLine = lines.find(line => !line.startsWith('//') && !line.startsWith('#') && !line.startsWith('*')) || lines[0] || '';
    return firstUsefulLine.slice(0, 160);
  }

  function enhanceRenderedMessage(container) {
    const filePathRegex = /From\s+`([^`]+):(\d+)(?:-(\d+))?`:/g;
    const paragraphs = container.querySelectorAll('p');

    paragraphs.forEach((p) => {
      const text = p.textContent;
      filePathRegex.lastIndex = 0;
      const match = filePathRegex.exec(text);

      if (!match) {
        return;
      }

      const filePath = match[1];
      const startLine = parseInt(match[2], 10);
      const endLine = match[3] ? parseInt(match[3], 10) : startLine;

      p.innerHTML = p.innerHTML.replace(
        /From\s+`([^`]+:\d+(?:-\d+)?)`:/,
        (fullMatch, pathWithLines) => `From <span class="file-path-link" data-file="${filePath}" data-start="${startLine}" data-end="${endLine}">\`${pathWithLines}\`</span>:`
      );

      let nextElement = p.nextElementSibling;
      while (nextElement && nextElement.tagName !== 'PRE') {
        nextElement = nextElement.nextElementSibling;
      }

      if (nextElement && nextElement.tagName === 'PRE') {
        nextElement.classList.add('clickable-code');
        nextElement.dataset.file = filePath;
        nextElement.dataset.startLine = String(startLine);
        nextElement.dataset.endLine = String(endLine);
      }
    });

    const inlineCodeElements = container.querySelectorAll('code:not(pre code)');
    inlineCodeElements.forEach((code) => {
      const text = code.textContent.trim();
      const matchedFile = findFile(text);

      code.classList.remove('file-link', 'symbol-link');
      delete code.dataset.file;
      delete code.dataset.symbol;

      if (matchedFile) {
        code.classList.add('file-link');
        code.dataset.file = matchedFile;
        return;
      }

      if (isSearchableSymbol(text)) {
        code.classList.add('symbol-link');
        code.dataset.symbol = text;
      }
    });

    const preElements = container.querySelectorAll('pre');
    preElements.forEach((pre) => {
      if (pre.classList.contains('clickable-code')) {
        return;
      }

      const query = getCodeSearchQuery(pre);
      if (!query) {
        return;
      }

      pre.classList.add('searchable-code');
      pre.dataset.query = query;
    });
  }

  function handleMessageClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const filePathLink = target.closest('.file-path-link');
    if (filePathLink && messagesDiv.contains(filePathLink)) {
      event.preventDefault();
      event.stopPropagation();
      console.log('[OCC] Clicked file path link:', filePathLink.dataset.file);
      vscode.postMessage({
        type: 'openFile',
        filePath: filePathLink.dataset.file,
        startLine: parseInt(filePathLink.dataset.start, 10),
        endLine: parseInt(filePathLink.dataset.end, 10)
      });
      return;
    }

    const fileLink = target.closest('.file-link');
    if (fileLink && messagesDiv.contains(fileLink)) {
      event.preventDefault();
      event.stopPropagation();
      console.log('[OCC] Clicked file link:', fileLink.dataset.file);
      vscode.postMessage({
        type: 'openFile',
        filePath: fileLink.dataset.file
      });
      return;
    }

    const symbolLink = target.closest('.symbol-link');
    if (symbolLink && messagesDiv.contains(symbolLink)) {
      event.preventDefault();
      event.stopPropagation();
      console.log('[OCC] Clicked symbol link:', symbolLink.dataset.symbol);
      vscode.postMessage({
        type: 'searchInProject',
        query: symbolLink.dataset.symbol
      });
      return;
    }

    const clickableCode = target.closest('.clickable-code');
    if (clickableCode && messagesDiv.contains(clickableCode)) {
      event.preventDefault();
      event.stopPropagation();
      console.log('[OCC] Clicked code block with file:', clickableCode.dataset.file);
      vscode.postMessage({
        type: 'openFile',
        filePath: clickableCode.dataset.file,
        startLine: parseInt(clickableCode.dataset.startLine, 10),
        endLine: parseInt(clickableCode.dataset.endLine, 10)
      });
      return;
    }

    const searchableCode = target.closest('.searchable-code');
    if (searchableCode && messagesDiv.contains(searchableCode)) {
      event.preventDefault();
      event.stopPropagation();
      console.log('[OCC] Clicked searchable code block:', searchableCode.dataset.query);
      vscode.postMessage({
        type: 'searchInProject',
        query: searchableCode.dataset.query
      });
    }
  }

  function sendMessage() {
    const text = input.value.trim();
    if (!text || isResponding) {
      return;
    }

    addMessage('user', text);
    input.value = '';
    currentMessage = '';
    autoResizeInput();

    vscode.postMessage({ type: 'sendMessage', text });
  }

  function getSelectedSessionId() {
    return sessionSelect.value || activeSessionId;
  }

  input.addEventListener('input', autoResizeInput);
  sendBtn.addEventListener('click', sendMessage);
  messagesDiv.addEventListener('click', handleMessageClick);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sessionSelect.addEventListener('change', (e) => {
    const sessionId = e.target.value;
    if (sessionId && sessionId !== activeSessionId) {
      vscode.postMessage({ type: 'switchSession', sessionId });
    }
  });

  newSessionBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'createSession' });
  });

  renameSessionBtn.addEventListener('click', () => {
    const sessionId = getSelectedSessionId();
    if (!sessionId) {
      return;
    }

    vscode.postMessage({ type: 'requestRenameSession', sessionId });
  });

  deleteSessionBtn.addEventListener('click', () => {
    const sessionId = getSelectedSessionId();
    if (!sessionId) {
      return;
    }

    vscode.postMessage({ type: 'deleteSession', sessionId });
  });

  input.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.style.borderColor = 'var(--vscode-focusBorder)';
  });

  input.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.style.borderColor = 'var(--vscode-input-border)';
  });

  input.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.style.borderColor = 'var(--vscode-input-border)';

    const text = e.dataTransfer.getData('text/plain');
    if (text) {
      const currentValue = input.value;
      const cursorPos = input.selectionStart;
      const newValue = currentValue.slice(0, cursorPos) + '\n```\n' + text + '\n```\n' + currentValue.slice(cursorPos);
      input.value = newValue;
      autoResizeInput();
      input.focus();
    }
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    console.log('[OCC] Received message:', message.type);

    switch (message.type) {
      case 'startResponse':
        isResponding = true;
        currentMessage = '';
        currentResponseNotices = [];
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        break;

      case 'chunk':
        currentMessage += message.data;
        updateAssistantMessage(composeAssistantDisplayContent());
        break;

      case 'responseStatus':
        appendUniqueNotice(message.data);
        updateAssistantMessage(composeAssistantDisplayContent());
        break;

      case 'responseUsage':
        appendUniqueNotice(message.data);
        updateAssistantMessage(composeAssistantDisplayContent());
        break;

      case 'endResponse':
        isResponding = false;
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
        break;

      case 'error':
        isResponding = false;
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
        addMessage('error', `Error: ${message.data}`);
        break;

      case 'clearChat':
        messagesDiv.innerHTML = '';
        break;

      case 'insertCode': {
        let contextText = '';

        if (message.filePath) {
          const lineInfo = message.startLine === message.endLine
            ? `:${message.startLine}`
            : `:${message.startLine}-${message.endLine}`;
          contextText = `From \`${message.filePath}${lineInfo}\`:\n\n`;
        }

        const codeBlock = '```' + message.language + '\n' + message.code + '\n```\n';
        const currentValue = input.value;
        const newContent = currentValue + (currentValue ? '\n' : '') + contextText + codeBlock;
        input.value = newContent;
        autoResizeInput();
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        break;
      }

      case 'fileList':
        projectFiles = message.files || [];
        buildFileIndex();
        document.querySelectorAll('.message').forEach(msg => enhanceRenderedMessage(msg));
        break;

      case 'sessionList':
        sessions = message.sessions || [];
        activeSessionId = message.activeSessionId;
        updateSessionSelect();
        break;

      case 'loadSessionMessages':
        messagesDiv.innerHTML = '';
        const messages = message.messages || [];
        messages.forEach(msg => {
          if (msg.role === 'user') {
            addMessage('user', msg.content);
          } else if (msg.role === 'assistant') {
            addMessage('assistant', msg.content);
          }
        });
        break;

      case 'sessionCreated':
      case 'sessionSwitched':
      case 'sessionDeleted':
        break;
    }
  });

  function updateSessionSelect() {
    sessionSelect.innerHTML = '';

    if (sessions.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No sessions';
      option.selected = true;
      sessionSelect.appendChild(option);
      sessionSelect.disabled = true;
      renameSessionBtn.disabled = true;
      deleteSessionBtn.disabled = true;
      return;
    }

    sessionSelect.disabled = false;
    sessions.forEach(session => {
      const option = document.createElement('option');
      option.value = session.id;
      option.textContent = session.name;
      if (session.id === activeSessionId) {
        option.selected = true;
      }
      sessionSelect.appendChild(option);
    });

    renameSessionBtn.disabled = !activeSessionId;
    deleteSessionBtn.disabled = sessions.length <= 1 || !activeSessionId;
  }

  function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    if (typeof marked !== 'undefined' && marked.parse) {
      div.innerHTML = marked.parse(content);
    } else {
      div.textContent = content;
    }
    enhanceRenderedMessage(div);
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function updateAssistantMessage(content) {
    let lastMsg = messagesDiv.querySelector('.message.assistant:last-child');

    if (!lastMsg) {
      lastMsg = document.createElement('div');
      lastMsg.className = 'message assistant';
      messagesDiv.appendChild(lastMsg);
    }

    lastMsg.innerHTML = marked.parse(content);
    enhanceRenderedMessage(lastMsg);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  vscode.postMessage({ type: 'ready' });
})();
