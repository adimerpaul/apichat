const socket = io();

const registerPanel = document.querySelector('#registerPanel');
const chatPanel = document.querySelector('#chatPanel');
const registerForm = document.querySelector('#registerForm');
const messageForm = document.querySelector('#messageForm');
const nameInput = document.querySelector('#nameInput');
const messageInput = document.querySelector('#messageInput');
const fileInput = document.querySelector('#fileInput');
const messagesList = document.querySelector('#messages');
const connectedUsersList = document.querySelector('#connectedUsers');
const currentUser = document.querySelector('#currentUser');
const registerError = document.querySelector('#registerError');
const messageError = document.querySelector('#messageError');

let activeUser = null;

function formatDate(value) {
  return new Intl.DateTimeFormat('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
}

function renderMessage(item) {
  const li = document.createElement('li');
  const isOwn = activeUser && Number(item.user_id) === Number(activeUser.id);
  li.dataset.id = item.id;

  if (isOwn) {
    li.classList.add('own');
  }

  li.innerHTML = `
    <div class="message-meta">
      <strong></strong>
      <span></span>
    </div>
    <div class="message-text"></div>
    <div class="message-media"></div>
  `;

  li.querySelector('strong').textContent = item.user_name;
  li.querySelector('span').textContent = formatDate(item.created_at);
  li.querySelector('.message-text').textContent = item.message || '';

  const mediaContainer = li.querySelector('.message-media');

  if (item.media_url && item.media_type === 'image') {
    const image = document.createElement('img');
    image.src = item.media_url;
    image.alt = item.media_name || 'Imagen enviada';
    mediaContainer.appendChild(image);
  }

  if (item.media_url && item.media_type === 'video') {
    const video = document.createElement('video');
    video.src = item.media_url;
    video.controls = true;
    video.preload = 'metadata';
    mediaContainer.appendChild(video);
  }

  messagesList.appendChild(li);
  messagesList.scrollTop = messagesList.scrollHeight;
}

function renderHistory(messages) {
  messagesList.innerHTML = '';
  messages.forEach(renderMessage);
}

function renderConnectedUsers(users) {
  connectedUsersList.innerHTML = '';

  users.forEach((user) => {
    const li = document.createElement('li');
    li.textContent = user.sockets > 1 ? `${user.name} (${user.sockets})` : user.name;
    connectedUsersList.appendChild(li);
  });
}

registerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  registerError.textContent = '';

  socket.emit('user:register', nameInput.value, (response) => {
    if (!response.ok) {
      registerError.textContent = response.message;
      return;
    }

    activeUser = response.user;
    currentUser.textContent = activeUser.name;
    registerPanel.hidden = true;
    chatPanel.hidden = false;
    messageInput.focus();
  });
});

messageForm.addEventListener('submit', (event) => {
  event.preventDefault();
  messageError.textContent = '';

  if (fileInput.files.length > 0) {
    const formData = new FormData();
    formData.append('user_id', activeUser.id);
    formData.append('message', messageInput.value);
    formData.append('file', fileInput.files[0]);

    fetch('/api/chats', {
      method: 'POST',
      body: formData,
    })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.message || 'No se pudo enviar el archivo.');
        }

        messageInput.value = '';
        fileInput.value = '';
        messageInput.focus();
      })
      .catch((error) => {
        messageError.textContent = error.message;
      });
    return;
  }

  socket.emit('chat:message', messageInput.value, (response) => {
    if (!response.ok) {
      messageError.textContent = response.message;
      return;
    }

    messageInput.value = '';
    messageInput.focus();
  });
});

socket.on('chat:history', renderHistory);
socket.on('chat:message', renderMessage);
socket.on('users:connected', renderConnectedUsers);
socket.on('chat:updated', (message) => {
  const currentMessages = Array.from(messagesList.children);
  const index = currentMessages.findIndex((node) => Number(node.dataset.id) === Number(message.id));

  if (index === -1) {
    return;
  }

  currentMessages[index].remove();
  renderMessage(message);
});
socket.on('chat:deleted', ({ id }) => {
  const item = Array.from(messagesList.children).find((node) => Number(node.dataset.id) === Number(id));

  if (item) {
    item.remove();
  }
});
