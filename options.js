/**
 * Options page script for SISREG AIH Client Extension
 */

class SisregOptions {
    constructor() {
        this.defaultSettings = {
            enableLogging: true,
            concurrency: 6,
            timeout: 30,
            csvDelimiter: ';',
            retries: 3,
            minDelayMs: 500,
            addBom: true,
            autoDownload: true
        };
        
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.bindEvents();
    }

    async loadSettings() {
        try {
            const settings = await chrome.storage.sync.get(this.defaultSettings);
            
            // Populate form fields with saved settings
            document.getElementById('enableLogging').checked = settings.enableLogging;
            document.getElementById('concurrency').value = settings.concurrency;
            document.getElementById('timeout').value = settings.timeout;
            document.getElementById('csvDelimiter').value = settings.csvDelimiter;
            document.getElementById('retries').value = settings.retries;
            document.getElementById('minDelayMs').value = settings.minDelayMs;
            document.getElementById('addBom').checked = settings.addBom;
            document.getElementById('autoDownload').checked = settings.autoDownload;
            
        } catch (error) {
            console.error('Failed to load settings:', error);
            this.showStatus('Erro ao carregar configurações', 'error');
        }
    }

    bindEvents() {
        document.getElementById('saveSettings').addEventListener('click', () => {
            this.saveSettings();
        });

        // Add real-time validation
        document.getElementById('timeout').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            if (value < 10) e.target.value = 10;
            if (value > 300) e.target.value = 300;
        });

        document.getElementById('retries').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            if (value < 1) e.target.value = 1;
            if (value > 10) e.target.value = 10;
        });

        document.getElementById('minDelayMs').addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            if (value < 100) e.target.value = 100;
            if (value > 5000) e.target.value = 5000;
        });

        // Auto-save on certain changes
        const autoSaveFields = ['enableLogging', 'concurrency', 'csvDelimiter'];
        autoSaveFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('change', () => {
                    this.saveSettings();
                });
            }
        });
    }

    async saveSettings() {
        try {
            const saveButton = document.getElementById('saveSettings');
            saveButton.disabled = true;
            saveButton.textContent = '💾 Salvando...';

            const settings = {
                enableLogging: document.getElementById('enableLogging').checked,
                concurrency: parseInt(document.getElementById('concurrency').value),
                timeout: parseInt(document.getElementById('timeout').value),
                csvDelimiter: document.getElementById('csvDelimiter').value,
                retries: parseInt(document.getElementById('retries').value),
                minDelayMs: parseInt(document.getElementById('minDelayMs').value),
                addBom: document.getElementById('addBom').checked,
                autoDownload: document.getElementById('autoDownload').checked
            };

            await chrome.storage.sync.set(settings);
            
            // Update SISREG configuration in active tabs
            await this.updateSisregConfig(settings);
            
            this.showStatus('✅ Configurações salvas com sucesso!', 'success');
            
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showStatus('❌ Erro ao salvar configurações', 'error');
        } finally {
            const saveButton = document.getElementById('saveSettings');
            saveButton.disabled = false;
            saveButton.textContent = '💾 Salvar Configurações';
        }
    }

    async updateSisregConfig(settings) {
        try {
            // Get all tabs with SISREG loaded
            const tabs = await chrome.tabs.query({
                url: "https://sisregiii.saude.gov.br/*"
            });

            // Update configuration in each tab
            for (const tab of tabs) {
                try {
                    await chrome.tabs.sendMessage(tab.id, {
                        action: 'updateSisregConfig',
                        config: {
                            log: settings.enableLogging,
                            timeoutMs: settings.timeout * 1000,
                            csvDelimiter: settings.csvDelimiter,
                            retry: {
                                retries: settings.retries,
                                minDelayMs: settings.minDelayMs,
                                factor: 2
                            }
                        }
                    });
                } catch (error) {
                    // Tab might not have content script loaded, ignore
                    console.log('Could not update config in tab:', tab.id);
                }
            }
        } catch (error) {
            console.error('Failed to update SISREG config:', error);
        }
    }

    showStatus(message, type) {
        const statusEl = document.getElementById('status');
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
        statusEl.style.display = 'block';

        // Auto-hide success messages after 3 seconds
        if (type === 'success') {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 3000);
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new SisregOptions();
});