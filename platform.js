/* Адаптер платформы: общий интерфейс для браузера и Telegram Mini App. */
(function createPlatformModule(root) {
  'use strict';

  const TELEGRAM_THEME_VARIABLES = {
    bg_color: '--tg-bg',
    secondary_bg_color: '--tg-secondary-bg',
    text_color: '--tg-text',
    hint_color: '--tg-hint',
    button_color: '--accent',
    button_text_color: '--button-text',
    destructive_text_color: '--tg-destructive',
  };

  function createPlatform(windowLike = root) {
    const telegram = windowLike?.Telegram?.WebApp || null;
    const documentElement = windowLike?.document?.documentElement;
    const isTelegram = () => Boolean(telegram);
    if (documentElement) documentElement.dataset.platform = telegram ? 'telegram' : 'browser';

    function applyTheme(params = telegram?.themeParams || {}) {
      if (!documentElement) return;
      documentElement.dataset.theme = telegram?.colorScheme === 'dark' ? 'dark' : 'light';
      Object.entries(TELEGRAM_THEME_VARIABLES).forEach(([key, variable]) => {
        if (params[key]) documentElement.style.setProperty(variable, params[key]);
      });
    }

    async function share(url, text) {
      if (telegram?.openTelegramLink) {
        telegram.openTelegramLink(url);
        return true;
      }
      if (typeof windowLike?.navigator?.share === 'function') {
        await windowLike.navigator.share({ url, text });
        return true;
      }
      if (typeof windowLike?.navigator?.clipboard?.writeText === 'function') {
        await windowLike.navigator.clipboard.writeText(url);
        return true;
      }
      return false;
    }

    return {
      mode: telegram ? 'telegram' : 'browser',
      getUserName() {
        return telegram?.initDataUnsafe?.user?.first_name || 'Гость';
      },
      getInitData() {
        return telegram?.initData || '';
      },
      goBack(handler) {
        if (typeof handler === 'function') {
          if (telegram?.BackButton?.onClick) telegram.BackButton.onClick(handler);
          else windowLike?.addEventListener?.('popstate', handler);
          return;
        }
        if (!telegram) windowLike?.history?.back?.();
      },
      setBackVisibility(visible) {
        if (!telegram?.BackButton) return;
        if (visible) telegram.BackButton.show?.();
        else telegram.BackButton.hide?.();
      },
      applyTheme,
      share,
      isTelegram,
      ready() { telegram?.ready?.(); },
      expand() { telegram?.expand?.(); },
      onThemeChanged(handler) { telegram?.onEvent?.('themeChanged', handler); },
      onViewportChanged(handler) { telegram?.onEvent?.('viewportChanged', handler); },
      getViewportHeight() { return telegram?.viewportHeight || 0; },
    };
  }

  const moduleApi = { createPlatform };
  if (typeof module !== 'undefined' && module.exports) module.exports = moduleApi;
  if (root) root.FashionStorePlatform = moduleApi;
})(typeof window !== 'undefined' ? window : globalThis);
