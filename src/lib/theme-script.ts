/**
 * Aplica o tema salvo (escuro, claro ou do sistema) antes da primeira pintura, para a tela não piscar.
 * O script é inline; a política de segurança (CSP) o autoriza pelo hash abaixo, já que ele não recebe o nonce
 * da requisição. Se o texto mudar, atualize o hash (o teste unitário theme-script.test.ts confere os dois).
 */
export const THEME_SCRIPT = `(function(){try{var media=window.matchMedia('(prefers-color-scheme: light)');function apply(){var preference=localStorage.getItem('lo-theme')||'dark';var theme=preference==='system'?(media.matches?'light':'dark'):(preference==='light'?'light':'dark');document.documentElement.setAttribute('data-theme',theme);var color=document.querySelector('meta[name="theme-color"]');if(color)color.setAttribute('content',theme==='light'?'#F5F7FA':'#0A0C13')}apply();var onChange=function(){if((localStorage.getItem('lo-theme')||'dark')==='system')apply()};if(media.addEventListener)media.addEventListener('change',onChange);else if(media.addListener)media.addListener(onChange)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`;

export const THEME_SCRIPT_CSP_HASH = "'sha256-CZbsXuAr/J/JQ7Ib64kXe+Sxm6dybCx8MiBkN1XhGT8='";
