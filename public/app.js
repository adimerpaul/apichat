const socket = io();

const registerPanel = document.querySelector('#registerPanel');
const chatPanel = document.querySelector('#chatPanel');
const registerForm = document.querySelector('#registerForm');
const messageForm = document.querySelector('#messageForm');
const nameInput = document.querySelector('#nameInput');
const messageInput = document.querySelector('#messageInput');
const messagesList = document.querySelector('#messages');
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

  if (isOwn) {
    li.classList.add('own');
  }

  li.innerHTML = `
    <div class="message-meta">
      <strong></strong>
      <span></span>
    </div>
    <div class="message-text"></div>
  `;

  li.querySelector('strong').textContent = item.user_name;
  li.querySelector('span').textContent = formatDate(item.created_at);
  li.querySelector('.message-text').textContent = item.message;

  messagesList.appendChild(li);
  messagesList.scrollTop = messagesList.scrollHeight;
}

function renderHistory(messages) {
  messagesList.innerHTML = '';
  messages.forEach(renderMessage);
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
