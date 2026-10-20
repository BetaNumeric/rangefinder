// Add to Home Screen (A2HS) functionality
let __deferredA2HSPrompt = null;

function isMobileDevice() {
  return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);
}

function isStandaloneDisplayMode() {
  // PWA standalone detection (Android/desktop)
  const standaloneMq = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari standalone detection
  const iosStandalone = window.navigator && window.navigator.standalone;
  return !!(standaloneMq || iosStandalone);
}

function getA2HSBannerElements() {
  const banner = document.getElementById('a2hs-banner');
  const installBtn = document.getElementById('a2hs-install-btn');
  const closeBtn = document.getElementById('a2hs-close-btn');
  const text = document.getElementById('a2hs-text');
  const iosOverlay = document.getElementById('ios-install-overlay');
  const iosCloseBtn = document.getElementById('ios-close-btn');
  return { banner, installBtn, closeBtn, text, iosOverlay, iosCloseBtn };
}

function shouldShowA2HSBanner() {
  if (!isMobileDevice()) return false;
  if (isStandaloneDisplayMode()) return false;
  return true;
}

function showA2HSBanner({ showInstallButton, text: messageText }) {
  const { banner, installBtn, closeBtn, text } = getA2HSBannerElements();
  if (!banner) return;
  
  // Clear all existing styles and CSS variables - use explicit styles only
  banner.style.cssText = '';
  banner.style.display = 'flex';
  banner.style.position = 'fixed';
  banner.style.top = '0px';
  banner.style.left = '0px';
  banner.style.right = '0px';
  banner.style.height = 'auto';
  banner.style.minHeight = '30px';
  banner.style.maxHeight = '50px';
  banner.style.zIndex = '99999';
  banner.style.backgroundColor = '#2c3e50';
  banner.style.color = '#ffffff';
  banner.style.padding = '8px 12px';
  banner.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
  banner.style.fontFamily = 'Helvetica, Arial, sans-serif';
  banner.style.fontSize = '14px';
  banner.style.alignItems = 'center';
  banner.style.justifyContent = 'space-between';
  banner.style.gap = '2px';
  banner.style.flexWrap = 'nowrap';
  
  // Set up the content
  if (text && messageText) {
    text.textContent = messageText;
    text.style.flex = '1';
    text.style.marginRight = '3px';
    text.style.fontSize = '12px';
    text.style.lineHeight = '1.2';
    text.style.overflow = 'hidden';
    text.style.textOverflow = 'ellipsis';
    text.style.whiteSpace = 'nowrap';
    text.style.minWidth = '0';
  }
  
  if (installBtn) {
    installBtn.style.display = showInstallButton ? 'inline-block' : 'none';
    installBtn.style.backgroundColor = '#3498db';
    installBtn.style.color = '#ffffff';
    installBtn.style.border = 'none';
    installBtn.style.padding = '10px 12px';
    installBtn.style.borderRadius = '6px';
    installBtn.style.fontSize = '15px';
    installBtn.style.cursor = 'pointer';
    installBtn.style.fontFamily = 'Helvetica, Arial, sans-serif';
    installBtn.style.flexShrink = '0';
    installBtn.style.whiteSpace = 'nowrap';
    installBtn.style.minWidth = '60px';
  }
  
  if (closeBtn) {
    closeBtn.style.backgroundColor = 'transparent';
    closeBtn.style.color = '#ffffff';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '4px 4px';
    closeBtn.style.fontFamily = 'Helvetica, Arial, sans-serif';
    closeBtn.style.flexShrink = '0';
    closeBtn.style.minWidth = '24px';
    closeBtn.onclick = () => {
      banner.style.display = 'none';
    };
  }
}

function initA2HSBanner() {
  if (!shouldShowA2HSBanner()) return;
  
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  
  // Handle Android/Chromium via beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing
    e.preventDefault();
    __deferredA2HSPrompt = e;
    const { installBtn } = getA2HSBannerElements();
    showA2HSBanner({ showInstallButton: true, text: 'Install for best experience' });
    if (installBtn) {
      installBtn.onclick = async () => {
        if (!__deferredA2HSPrompt) return;
        __deferredA2HSPrompt.prompt();
        try { await __deferredA2HSPrompt.userChoice; } catch (_) {}
        __deferredA2HSPrompt = null;
        const { banner } = getA2HSBannerElements();
        if (banner) banner.style.display = 'none';
      };
    }
  });
  
  // Handle iOS Safari (no beforeinstallprompt)
  if (isIOS) {
    const { installBtn, iosOverlay, iosCloseBtn } = getA2HSBannerElements();
    showA2HSBanner({ showInstallButton: true, text: 'Install for best experience' });
    if (installBtn) {
      installBtn.textContent = 'How to Install';
      installBtn.onclick = () => {
        if (iosOverlay) iosOverlay.style.display = 'flex';
      };
    }
    if (iosCloseBtn && iosOverlay) {
      iosCloseBtn.onclick = () => { iosOverlay.style.display = 'none'; };
      iosOverlay.onclick = (e) => {
        if (e.target === iosOverlay) iosOverlay.style.display = 'none';
      };
    }
  }
  
  // Android fallback if beforeinstallprompt doesn't fire
  if (isAndroid) {
    setTimeout(() => {
      if (!__deferredA2HSPrompt) {
        showA2HSBanner({ showInstallButton: false, text: 'Install: Menu → Add to Home screen' });
      }
    }, 2000);
  }
  
  // Hide banner when app is installed
  window.addEventListener('appinstalled', () => {
    const { banner } = getA2HSBannerElements();
    if (banner) banner.style.display = 'none';
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initA2HSBanner);
} else {
  initA2HSBanner();
}
