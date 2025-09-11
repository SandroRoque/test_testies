/**
 * Content Script for SISREG AIH Client Extension
 * Injects the main SISREG client into the page and handles communication with the extension
 */

(function() {
  'use strict';

  // Check if we're on the correct domain
  if (!window.location.hostname.includes('sisregiii.saude.gov.br')) {
    return;
  }

  // Inject the main SISREG client script
  function injectSisregClient() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('sisreg-client.js');
    script.onload = function() {
      this.remove();
      console.log('SISREG Client injected successfully');
    };
    (document.head || document.documentElement).appendChild(script);
  }

  // Add visual indicator that extension is active
  function addExtensionIndicator() {
    if (document.getElementById('sisreg-extension-indicator')) return;

    const indicator = document.createElement('div');
    indicator.id = 'sisreg-extension-indicator';
    indicator.innerHTML = '🏥 SISREG Extension Ativa';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #4CAF50;
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: Arial, sans-serif;
      font-size: 12px;
      z-index: 10000;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      transition: opacity 0.3s;
    `;

    document.body.appendChild(indicator);

    // Auto-hide after 3 seconds
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.style.opacity = '0.3';
      }
    }, 3000);

    // Show/hide on hover
    indicator.addEventListener('mouseenter', () => {
      indicator.style.opacity = '1';
    });
    
    indicator.addEventListener('mouseleave', () => {
      indicator.style.opacity = '0.3';
    });
  }

  // Listen for messages from the popup and options
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkSisregStatus') {
      sendResponse({
        loaded: typeof window.SISREG !== 'undefined',
        url: window.location.href,
        domain: window.location.hostname
      });
    }
    
    if (request.action === 'updateSisregConfig') {
      try {
        if (window.SISREG && window.SISREG.config) {
          Object.assign(window.SISREG.config, request.config);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'SISREG not loaded' });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }
    
    if (request.action === 'executeSisregFunction') {
      const { functionName, args } = request;
      
      try {
        // Navigate the SISREG API structure
        const parts = functionName.split('.');
        let fn = window.SISREG;
        
        for (const part of parts) {
          fn = fn[part];
          if (!fn) {
            throw new Error(`Function ${functionName} not found`);
          }
        }
        
        if (typeof fn === 'function') {
          const result = fn.apply(null, args || []);
          
          // Handle promises
          if (result && typeof result.then === 'function') {
            result.then(data => {
              sendResponse({ success: true, data: data });
            }).catch(error => {
              sendResponse({ success: false, error: error.message });
            });
            return true; // Will respond asynchronously
          } else {
            sendResponse({ success: true, data: result });
          }
        } else {
          sendResponse({ success: false, error: 'Not a function' });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }
  });

  // Wait for DOM to be ready, then inject
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectSisregClient();
      addExtensionIndicator();
    });
  } else {
    injectSisregClient();
    addExtensionIndicator();
  }

})();