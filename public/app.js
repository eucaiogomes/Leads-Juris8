const elements = {
  loginView: document.getElementById('login-view'),
  loginForm: document.getElementById('login-form'),
  loginButton: document.getElementById('login-button'),
  loginError: document.getElementById('login-error'),
  password: document.getElementById('admin-password'),
  togglePassword: document.getElementById('toggle-password'),
  dashboard: document.getElementById('dashboard'),
  logout: document.getElementById('logout-button'),
  refresh: document.getElementById('refresh-button'),
  refreshSidebar: document.getElementById('refresh-sidebar'),
  search: document.getElementById('search-input'),
  statusFilter: document.getElementById('status-filter'),
  leadsBody: document.getElementById('leads-body'),
  emptyState: document.getElementById('empty-state'),
  navCount: document.getElementById('nav-count'),
  statTotal: document.getElementById('stat-total'),
  statNew: document.getElementById('stat-new'),
  statProgress: document.getElementById('stat-progress'),
  statConverted: document.getElementById('stat-converted'),
  dialog: document.getElementById('lead-dialog'),
  detailForm: document.getElementById('detail-form'),
  detailTitle: document.getElementById('detail-title'),
  detailGrid: document.getElementById('detail-grid'),
  detailStatus: document.getElementById('detail-status'),
  detailNotes: document.getElementById('detail-notes'),
  detailUpdated: document.getElementById('detail-updated'),
  closeDialog: document.getElementById('close-dialog'),
  saveLead: document.getElementById('save-lead'),
  toast: document.getElementById('toast'),
};

const statusLabels = {
  novo: 'Novo',
  contatado: 'Contatado',
  qualificado: 'Qualificado',
  convertido: 'Convertido',
  descartado: 'Descartado',
};

const state = {
  leads: [],
  currentLeadId: null,
  refreshTimer: null,
  toastTimer: null,
};

bootstrap();

async function bootstrap() {
  bindEvents();
  try {
    const session = await api('/api/session');
    if (session.authenticated) {
      showDashboard();
      await loadLeads();
      return;
    }
  } catch {
    elements.loginError.textContent = 'Não foi possível conectar ao servidor.';
  }
  showLogin();
}

function bindEvents() {
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.togglePassword.addEventListener('click', togglePasswordVisibility);
  elements.logout.addEventListener('click', handleLogout);
  elements.refresh.addEventListener('click', () => loadLeads(elements.refresh));
  elements.refreshSidebar.addEventListener('click', () => loadLeads(elements.refreshSidebar));
  elements.search.addEventListener('input', renderLeads);
  elements.statusFilter.addEventListener('change', renderLeads);
  elements.closeDialog.addEventListener('click', () => elements.dialog.close());
  elements.detailForm.addEventListener('submit', saveLeadChanges);
  elements.dialog.addEventListener('click', (event) => {
    if (event.target === elements.dialog) elements.dialog.close();
  });
}

async function handleLogin(event) {
  event.preventDefault();
  elements.loginError.textContent = '';
  const password = elements.password.value;
  if (!password) {
    elements.loginError.textContent = 'Digite a senha do administrador.';
    elements.password.focus();
    return;
  }

  setButtonLoading(elements.loginButton, true, 'Entrando...');
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    elements.loginForm.reset();
    showDashboard();
    await loadLeads();
    document.getElementById('main-content').focus();
  } catch (error) {
    elements.loginError.textContent = error.message || 'Não foi possível entrar.';
    elements.password.focus();
  } finally {
    setButtonLoading(elements.loginButton, false, 'Acessar painel');
  }
}

function togglePasswordVisibility() {
  const visible = elements.password.type === 'text';
  elements.password.type = visible ? 'password' : 'text';
  elements.togglePassword.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
  elements.password.focus();
}

async function handleLogout() {
  try {
    await api('/api/logout', { method: 'POST' });
  } finally {
    state.leads = [];
    showLogin();
  }
}

function showLogin() {
  clearInterval(state.refreshTimer);
  elements.dashboard.hidden = true;
  elements.loginView.hidden = false;
  requestAnimationFrame(() => elements.password.focus());
}

function showDashboard() {
  elements.loginView.hidden = true;
  elements.dashboard.hidden = false;
  clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(() => loadLeads(), 30_000);
}

async function loadLeads(trigger) {
  if (trigger) trigger.classList.add('loading');
  try {
    const result = await api('/api/leads');
    state.leads = Array.isArray(result.leads) ? result.leads : [];
    renderStats();
    renderLeads();
  } catch (error) {
    if (error.status === 401) {
      showLogin();
      elements.loginError.textContent = 'Sua sessão expirou. Entre novamente.';
      return;
    }
    showToast(error.message || 'Não foi possível atualizar os leads.', true);
  } finally {
    if (trigger) trigger.classList.remove('loading');
  }
}

function renderStats() {
  const counts = state.leads.reduce((result, lead) => {
    result[lead.status] = (result[lead.status] || 0) + 1;
    return result;
  }, {});
  elements.statTotal.textContent = String(state.leads.length);
  elements.statNew.textContent = String(counts.novo || 0);
  elements.statProgress.textContent = String((counts.contatado || 0) + (counts.qualificado || 0));
  elements.statConverted.textContent = String(counts.convertido || 0);
  elements.navCount.textContent = String(state.leads.length);
}

function renderLeads() {
  const query = normalizeText(elements.search.value);
  const status = elements.statusFilter.value;
  const filtered = state.leads.filter((lead) => {
    const searchable = normalizeText(`${lead.name} ${lead.office} ${lead.email} ${lead.whatsapp} ${lead.interest}`);
    return (!query || searchable.includes(query)) && (status === 'todos' || lead.status === status);
  });

  elements.leadsBody.replaceChildren();
  elements.emptyState.hidden = filtered.length > 0;
  document.querySelector('.table-wrap').hidden = filtered.length === 0;

  filtered.forEach((lead) => elements.leadsBody.append(createLeadRow(lead)));
}

function createLeadRow(lead) {
  const row = document.createElement('tr');

  const contact = document.createElement('td');
  contact.append(
    textElement('span', lead.name, 'contact-name'),
    textElement('span', lead.email, 'contact-email'),
  );

  const office = document.createElement('td');
  office.append(textElement('span', lead.office, 'cell-truncate'));

  const interest = document.createElement('td');
  interest.append(textElement('span', lead.interest, 'cell-truncate'));

  const cnpjs = document.createElement('td');
  cnpjs.textContent = formatCnpjs(lead.cnpjs);

  const date = document.createElement('td');
  date.className = 'date-cell';
  const [datePart, timePart] = formatDate(lead.receivedAt);
  date.append(document.createTextNode(datePart), document.createElement('br'), document.createTextNode(timePart));

  const status = document.createElement('td');
  status.append(createStatusPill(lead.status));

  const action = document.createElement('td');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'open-lead';
  button.setAttribute('aria-label', `Abrir lead de ${lead.name}`);
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
  button.addEventListener('click', () => openLead(lead.id));
  action.append(button);

  row.append(contact, office, interest, cnpjs, date, status, action);
  return row;
}

function createStatusPill(status) {
  const pill = textElement('span', statusLabels[status] || 'Novo', `status-pill status-${status || 'novo'}`);
  return pill;
}

function openLead(id) {
  const lead = state.leads.find((item) => item.id === id);
  if (!lead) return;
  state.currentLeadId = id;
  elements.detailTitle.textContent = lead.name;
  elements.detailStatus.value = lead.status;
  elements.detailNotes.value = lead.notes || '';
  elements.detailUpdated.textContent = `Recebido em ${formatDateLong(lead.receivedAt)}`;
  elements.detailGrid.replaceChildren(
    detailItem('E-mail', lead.email, `mailto:${lead.email}`),
    detailItem('WhatsApp', lead.whatsapp, `https://wa.me/55${String(lead.whatsapp).replace(/\D/g, '')}`),
    detailItem('Escritório', lead.office),
    detailItem('CNPJs', formatCnpjs(lead.cnpjs)),
    detailItem('Interesse', lead.interest, '', true),
  );
  elements.dialog.showModal();
  requestAnimationFrame(() => elements.detailStatus.focus());
}

function detailItem(label, value, href = '', full = false) {
  const item = document.createElement('div');
  item.className = `detail-item${full ? ' full' : ''}`;
  item.append(textElement('span', label));
  if (href) {
    const link = document.createElement('a');
    link.href = href;
    if (href.startsWith('https://')) {
      link.target = '_blank';
      link.rel = 'noreferrer';
    }
    link.textContent = value;
    item.append(link);
  } else {
    item.append(textElement('strong', value));
  }
  return item;
}

async function saveLeadChanges(event) {
  event.preventDefault();
  if (!state.currentLeadId) return;
  setButtonLoading(elements.saveLead, true, 'Salvando...');
  try {
    const result = await api(`/api/leads/${state.currentLeadId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: elements.detailStatus.value,
        notes: elements.detailNotes.value,
      }),
    });
    const index = state.leads.findIndex((lead) => lead.id === state.currentLeadId);
    if (index >= 0) state.leads[index] = result.lead;
    renderStats();
    renderLeads();
    elements.dialog.close();
    showToast('Lead atualizado com sucesso.');
  } catch (error) {
    showToast(error.message || 'Não foi possível salvar a atualização.', true);
  } finally {
    setButtonLoading(elements.saveLead, false, 'Salvar atualização');
  }
}

function textElement(tag, text, className = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text || '—';
  return element;
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function formatCnpjs(value) {
  const labels = {
    '1-5': '1 a 5',
    '6-10': '6 a 10',
    '11-25': '11 a 25',
    '26-50': '26 a 50',
    '51+': 'Mais de 50',
  };
  return labels[value] || value || 'Não informado';
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return ['Data inválida', ''];
  return [
    new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date),
    new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date),
  ];
}

function formatDateLong(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'data desconhecida';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function setButtonLoading(button, loading, label) {
  button.disabled = loading;
  button.setAttribute('aria-busy', String(loading));
  const labelElement = button.querySelector('span');
  if (labelElement) labelElement.textContent = label;
  else button.textContent = label;
}

function showToast(message, error = false) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `toast show${error ? ' error' : ''}`;
  state.toastTimer = setTimeout(() => {
    elements.toast.className = 'toast';
  }, 4000);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Não foi possível concluir a solicitação.');
    error.status = response.status;
    throw error;
  }
  return payload;
}
