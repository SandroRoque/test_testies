/**
 * Background Script for SISREG AIH Client Extension
 * Handles extension lifecycle and communication between components
 */

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('SISREG AIH Client Extension installed:', details);
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SISREG_LOADED') {
    console.log('SISREG client loaded on:', message.url);
    
    // Update icon to show active state
    if (sender.tab) {
      chrome.action.setBadgeText({
        text: '✓',
        tabId: sender.tab.id
      });
      
      chrome.action.setBadgeBackgroundColor({
        color: '#4CAF50',
        tabId: sender.tab.id
      });
    }
  }
});

// Handle tab updates to reset badge
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (!tab.url.includes('sisregiii.saude.gov.br')) {
      chrome.action.setBadgeText({
        text: '',
        tabId: tabId
      });
    }
  }
});

// Handle active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  
  if (!tab.url || !tab.url.includes('sisregiii.saude.gov.br')) {
    chrome.action.setBadgeText({
      text: '',
      tabId: activeInfo.tabId
    });
  }
});