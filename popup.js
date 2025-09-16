/**
 * Popup Script for SISREG AIH Client Extension
 * Handles user interface interactions and communication with content scripts
 */

class SisregPopup {
    constructor() {
        this.currentTab = null;
        this.isConnected = false;
        this.init();
    }

    async init() {
        await this.getCurrentTab();
        await this.checkConnection();
        this.bindEvents();
        this.loadSettings();
    }

    async getCurrentTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        this.currentTab = tab;
    }

    async checkConnection() {
        if (!this.currentTab) return;

        // Check if we're on the correct domain first
        if (!this.currentTab.url || !this.currentTab.url.includes('sisregiii.saude.gov.br')) {
            this.isConnected = false;
            this.updateConnectionStatus();
            return;
        }

        // Update status to show checking
        this.updateConnectionStatus('checking');

        // Retry logic for checking SISREG status (may need time to load)
        const maxRetries = 3;
        let retryDelay = 500; // Start with 500ms delay

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await chrome.tabs.sendMessage(this.currentTab.id, {
                    action: 'checkSisregStatus'
                });

                if (response && response.loaded) {
                    this.isConnected = true;
                    this.updateConnectionStatus();
                    return;
                }

                // If not loaded yet and we have more attempts, wait and retry
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    retryDelay *= 1.5; // Increase delay for next attempt
                }
            } catch (error) {
                console.error(`Connection check attempt ${attempt} failed:`, error);
                
                // If it's the last attempt, fail
                if (attempt === maxRetries) {
                    this.isConnected = false;
                    this.updateConnectionStatus();
                    return;
                }

                // Wait before retrying
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    retryDelay *= 1.5;
                }
            }
        }

        // If we get here, all attempts failed
        this.isConnected = false;
        this.updateConnectionStatus();
    }

    updateConnectionStatus(state) {
        const statusEl = document.getElementById('status');
        const statusText = statusEl.querySelector('.status-text');
        const connectedSection = document.getElementById('connected');
        const notConnectedSection = document.getElementById('not-connected');

        if (state === 'checking') {
            statusEl.className = 'status checking';
            statusText.textContent = 'Verificando conexão...';
            connectedSection.classList.add('hidden');
            notConnectedSection.classList.add('hidden');
        } else if (this.isConnected) {
            statusEl.className = 'status connected';
            statusText.textContent = 'Conectado ao SISREG';
            connectedSection.classList.remove('hidden');
            notConnectedSection.classList.add('hidden');
        } else {
            statusEl.className = 'status disconnected';
            statusText.textContent = 'Não conectado';
            connectedSection.classList.add('hidden');
            notConnectedSection.classList.remove('hidden');
        }
    }

    bindEvents() {
        // Individual queries
        document.getElementById('getAihDetalhe').addEventListener('click', () => {
            const codSol = document.getElementById('codSolicitacao').value;
            if (!codSol) {
                alert('Por favor, insira o código da solicitação');
                return;
            }
            this.executeSisregFunction('api.getAihDetalhe', [codSol]);
        });

        document.getElementById('pegaNumeroAih').addEventListener('click', () => {
            const codSol = document.getElementById('codSolicitacao').value;
            if (!codSol) {
                alert('Por favor, insira o código da solicitação');
                return;
            }
            this.executeSisregFunction('api.pegaNumeroAih', [codSol]);
        });

        // Internation management
        document.getElementById('enviarInternacao').addEventListener('click', () => {
            const codSol = document.getElementById('codSolicitacao').value;
            const dtInternacao = document.getElementById('dtInternacao').value;
            const medico = document.getElementById('medicoInternacao').value;

            if (!codSol || !dtInternacao || !medico) {
                alert('Por favor, preencha todos os campos obrigatórios');
                return;
            }

            // Convert date format from YYYY-MM-DD to DD/MM/YYYY
            const [year, month, day] = dtInternacao.split('-');
            const formattedDate = `${day}/${month}/${year}`;

            this.executeSisregFunction('api.enviarInternacao', [codSol, formattedDate, medico]);
        });

        document.getElementById('internarAltaExtrairAIH').addEventListener('click', () => {
            const codSol = document.getElementById('codSolicitacao').value;
            const dtInternacao = document.getElementById('dtInternacao').value;
            const medico = document.getElementById('medicoInternacao').value;
            const motivoAlta = parseInt(document.getElementById('motivoAlta').value);

            if (!codSol || !dtInternacao || !medico) {
                alert('Por favor, preencha todos os campos obrigatórios');
                return;
            }

            const [year, month, day] = dtInternacao.split('-');
            const formattedDate = `${day}/${month}/${year}`;

            this.executeSisregFunction('api.internarAltaExtrairAIH', [codSol, formattedDate, medico, motivoAlta]);
        });

        // Discharge management
        document.getElementById('enviarAlta').addEventListener('click', () => {
            const codSol = document.getElementById('codSolicitacao').value;
            const motivoAlta = parseInt(document.getElementById('motivoAlta').value);

            if (!codSol) {
                alert('Por favor, insira o código da solicitação');
                return;
            }

            if (confirm(`Confirma envio de alta com motivo ${motivoAlta} para solicitação ${codSol}?`)) {
                this.executeSisregFunction('api.enviarAlta', [motivoAlta, codSol]);
            }
        });

        document.getElementById('pegaNumeroAihAltaCondicional').addEventListener('click', () => {
            const codSol = document.getElementById('codSolicitacao').value;
            const motivoAlta = parseInt(document.getElementById('motivoAlta').value);

            if (!codSol) {
                alert('Por favor, insira o código da solicitação');
                return;
            }

            this.executeSisregFunction('api.pegaNumeroAihAltaCondicional', [codSol, motivoAlta]);
        });

        // Bulk exports
        document.getElementById('crawlHospitalizations').addEventListener('click', () => {
            if (confirm('Iniciar exportação de todas as hospitalizações? Isso pode demorar vários minutos.')) {
                this.startBulkOperation('api.crawlHospitalizations', 'aih_hospitalizacoes.csv');
            }
        });

        document.getElementById('crawlAuthorizations').addEventListener('click', () => {
            if (confirm('Iniciar exportação de todas as autorizações? Isso pode demorar vários minutos.')) {
                this.startBulkOperation('api.crawlAuthorizations', 'aih_autorizacoes.csv');
            }
        });

        document.getElementById('crawlSisreg').addEventListener('click', () => {
            if (confirm('Iniciar exportação completa do SISREG? Isso pode demorar bastante tempo.')) {
                this.startBulkOperation('api.crawlSisreg', 'aih_sisreg_completo.csv');
            }
        });

        // Settings
        document.getElementById('enableLogging').addEventListener('change', (e) => {
            this.updateSetting('log', e.target.checked);
        });

        document.getElementById('concurrency').addEventListener('change', (e) => {
            const value = parseInt(e.target.value);
            if (value >= 1 && value <= 10) {
                this.updateSetting('concurrency', value);
            }
        });

        // Footer links
        document.getElementById('openHelp').addEventListener('click', (e) => {
            e.preventDefault();
            this.showHelp();
        });

        document.getElementById('openOptions').addEventListener('click', (e) => {
            e.preventDefault();
            chrome.runtime.openOptionsPage();
        });

        // Add refresh connection button handler
        document.getElementById('refreshConnection').addEventListener('click', async (e) => {
            e.preventDefault();
            const refreshBtn = e.target;
            
            // Visual feedback
            refreshBtn.style.opacity = '0.5';
            refreshBtn.disabled = true;
            
            try {
                await this.getCurrentTab();
                await this.checkConnection();
            } finally {
                // Restore button state
                setTimeout(() => {
                    refreshBtn.style.opacity = '';
                    refreshBtn.disabled = false;
                }, 500);
            }
        });
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['enableLogging', 'concurrency']);
            
            document.getElementById('enableLogging').checked = result.enableLogging !== false;
            document.getElementById('concurrency').value = result.concurrency || 6;
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async updateSetting(key, value) {
        try {
            await chrome.storage.sync.set({ [key]: value });
            
            // Update SISREG config if connected
            if (this.isConnected) {
                const configKey = key === 'enableLogging' ? 'log' : key;
                await chrome.tabs.sendMessage(this.currentTab.id, {
                    action: 'executeSisregFunction',
                    functionName: 'config',
                    args: [configKey, value]
                });
            }
        } catch (error) {
            console.error('Failed to update setting:', error);
        }
    }

    async executeSisregFunction(functionName, args = []) {
        if (!this.isConnected) {
            alert('Extensão não conectada ao SISREG');
            return;
        }

        try {
            this.setButtonsLoading(true);
            
            const response = await chrome.tabs.sendMessage(this.currentTab.id, {
                action: 'executeSisregFunction',
                functionName: functionName,
                args: args
            });

            this.setButtonsLoading(false);

            if (response.success) {
                console.log('Function result:', response.data);
                alert('Operação concluída com sucesso! Verifique o console para detalhes.');
            } else {
                console.error('Function error:', response.error);
                alert(`Erro: ${response.error}`);
            }
        } catch (error) {
            this.setButtonsLoading(false);
            console.error('Communication error:', error);
            alert('Erro de comunicação com a página');
        }
    }

    async startBulkOperation(functionName, defaultFilename) {
        if (!this.isConnected) {
            alert('Extensão não conectada ao SISREG');
            return;
        }

        const concurrency = parseInt(document.getElementById('concurrency').value) || 6;
        const progressContainer = document.getElementById('progressContainer');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');

        try {
            this.setButtonsLoading(true);
            progressContainer.classList.remove('hidden');
            progressText.textContent = 'Iniciando operação...';

            const opts = {
                csvName: defaultFilename,
                concurrency: concurrency,
                onProgress: (progress) => {
                    if (progress.done && progress.total) {
                        const percentage = Math.round((progress.done / progress.total) * 100);
                        progressFill.style.width = `${percentage}%`;
                        progressText.textContent = `Processando: ${progress.done}/${progress.total} (${percentage}%)`;
                    } else if (progress.pagina && progress.totalPages) {
                        progressText.textContent = `Carregando página ${progress.pagina}/${progress.totalPages}`;
                    }
                }
            };

            const response = await chrome.tabs.sendMessage(this.currentTab.id, {
                action: 'executeSisregFunction',
                functionName: functionName,
                args: [opts]
            });

            this.setButtonsLoading(false);
            progressContainer.classList.add('hidden');
            progressFill.style.width = '0%';

            if (response.success) {
                const count = Array.isArray(response.data) ? response.data.length : 'N/A';
                alert(`Exportação concluída! ${count} registros processados. Arquivo baixado automaticamente.`);
            } else {
                alert(`Erro na exportação: ${response.error}`);
            }
        } catch (error) {
            this.setButtonsLoading(false);
            progressContainer.classList.add('hidden');
            progressFill.style.width = '0%';
            console.error('Bulk operation error:', error);
            alert('Erro durante a operação em massa');
        }
    }

    setButtonsLoading(loading) {
        const buttons = document.querySelectorAll('.btn');
        buttons.forEach(btn => {
            btn.disabled = loading;
            if (loading) {
                btn.style.opacity = '0.6';
                btn.style.cursor = 'not-allowed';
            } else {
                btn.style.opacity = '';
                btn.style.cursor = '';
            }
        });
    }

    showHelp() {
        const helpContent = `
        🏥 SISREG AIH Client - Ajuda

        FUNÇÕES DISPONÍVEIS:

        📋 Consultas Individuais:
        • Obter Detalhes AIH: Busca informações completas de uma solicitação
        • Obter Número AIH: Extrai apenas o número da AIH

        🏥 Gestão de Internações:
        • Enviar Internação: Registra internação com data e médico
        • Internar + Alta + AIH: Processo completo automatizado

        📤 Gestão de Altas:
        • Enviar Alta: Registra alta hospitalar
        • Obter AIH + Alta Condicional: Obtém AIH com alta automática se necessário

        📊 Exportações em Massa:
        • Exportar Hospitalizações: Baixa todas as hospitalizações em CSV
        • Exportar Autorizações: Baixa todas as autorizações em CSV
        • Exportar Tudo: Exportação completa unificada

        DICAS:
        • Use a concorrência adequada (recomendado: 6)
        • Mantenha logs habilitados para debug
        • Operações em massa podem demorar vários minutos
        • Sempre confirme os dados antes de executar ações críticas

        Para mais informações, acesse a documentação da extensão.
        `;

        alert(helpContent);
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SisregPopup();
});