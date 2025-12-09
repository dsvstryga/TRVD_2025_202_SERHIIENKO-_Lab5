// frontend/js/main.js - small loader to prevent 404/MIME errors
console.log('main.js loaded');

// Try to call light inits if available
try { if (window.profileManager && typeof window.profileManager.init === 'function') window.profileManager.init(); } catch (e) {}
try { if (window.musicPlayer && typeof window.musicPlayer.init === 'function') window.musicPlayer.init(); } catch (e) {}
