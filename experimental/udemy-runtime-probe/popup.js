const reportNode = document.getElementById('report');
const clearButton = document.getElementById('clear');

function render(report) {
  reportNode.textContent = report ? JSON.stringify(report, null, 2) : 'Nenhum relatório disponível.';
}

chrome.runtime.sendMessage({ type: 'SIA_UDY_GET_REPORT' }).then((response) => {
  render(response?.report || null);
}).catch(() => {
  reportNode.textContent = 'Não foi possível obter o relatório da sessão.';
});

clearButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'SIA_UDY_CLEAR_REPORT' }).then(() => render(null)).catch(() => {});
});
