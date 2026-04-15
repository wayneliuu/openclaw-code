(function() {
  const vscode = acquireVsCodeApi();
  
  const messagesDiv = document.getElementById('messages');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');

  let currentMessage = '';
  let isResponding = false;

  // 通知后端 webview 已准备好
  vscode.postMessage({ type: 'ready' });

  // 自动调整输入框高度
  function autoResizeInput() {
    input.style.height = 'auto';
    const newHeight = Math.min(Math.max(input.scrollHeight, 60), 300);
    input.style.height = newHeight + 'px';
  }

  input.addEventListener('input', autoResizeInput);
  
  sendBtn.addEventListener('click', sendMessage);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // 拖拽代码功能
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

  function sendMessage() {
    const text = input.value.trim();
    if (!text || isResponding) return;

    addMessage('user', text);
    input.value = '';
    currentMessage = '';
    autoResizeInput();
    
    vscode.postMessage({ type: 'sendMessage', text });
  }

  window.addEventListener('message', (event) => {
    const message = event.data;
    
    switch (message.type) {
      case 'startResponse':
        isResponding = true;
        currentMessage = '';
        sendBtn.disabled = true;
        sendBtn.style.opacity = '0.5';
        break;

      case 'chunk':
        currentMessage += message.data;
        updateAssistantMessage(currentMessage);
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

      case 'insertCode':
        let contextText = '';
        
        // 添加文件路径和行号信息
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

      case 'workspaceInfo':
        // 正常加载时不显示任何消息，保持简洁
        break;
    }
  });

  function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    
    if (role === 'user') {
      div.textContent = content;
    } else {
      div.innerHTML = marked.parse(content);
    }
    
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
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
})();
