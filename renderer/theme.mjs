// Component-scoped aliases: missing host tokens leave each existing fallback intact.
export const THEME_CSS = `
.knowstack-settings,.knowstack-editor,.knowstack-memory-confirm,.knowstack-memory,.knowstack-outdated,.knowstack-outdated-final{
--ks-panel:var(--ds-bg-dock,var(--ds-bg-primary));--ks-surface:var(--ds-bg-elevated-opaque);--ks-secondary:var(--ds-bg-secondary);--ks-input:var(--ds-bg-tertiary);--ks-ink:var(--ds-text-primary);--ks-muted:var(--ds-text-secondary);--ks-line:var(--ds-border-default);--ks-accent:var(--ds-accent);--ks-accent-ink:var(--ds-bg-primary);--ks-danger:var(--ds-error);--ks-warning:var(--ds-warning);--ks-track:var(--ds-switch-track-off);--ks-knob-off:var(--ds-switch-knob-off);--ks-knob-on:var(--ds-switch-knob-on)
}
.knowstack-settings,.knowstack-editor,.knowstack-memory-confirm{background:var(--ks-surface,var(--bg-elevated,#f7fbff));color:var(--ks-ink,var(--text-primary,#193a51));border-color:var(--ks-line,var(--border-color,#d7e6ef))}
.km-docked .knowstack-editor{background:var(--ks-panel,var(--bg-primary,var(--bg-elevated,#f7fbff)))}
.knowstack-settings p,.knowstack-settings .ks-path,.knowstack-settings .ks-hint,.knowstack-settings .ks-switch-tag,.knowstack-settings .ks-status,.knowstack-editor p,.knowstack-editor .km-path,.knowstack-editor .km-status,.knowstack-editor .km-delete{color:var(--ks-muted,var(--text-secondary,#527089))}
.knowstack-editor .km-link,.knowstack-editor .km-number{color:var(--ks-muted,var(--text-secondary,#376586))}
.knowstack-settings .ks-refresh{color:var(--ks-ink,var(--text-primary,#17618d))}
.knowstack-settings .ks-default{background:var(--ks-secondary,var(--bg-secondary,#eaf3fb))}
.knowstack-settings .ks-project,.knowstack-settings footer,.knowstack-settings .ks-default-item+.ks-default-item{border-color:var(--ks-line,var(--border-color,#dfeaf2))}
.knowstack-editor .km-item{background:var(--ks-secondary,var(--bg-secondary,#edf5fb));border-color:var(--ks-line,var(--border-color,#d7e6ef))}
.knowstack-editor select{background:var(--ks-secondary,var(--bg-secondary,#eaf3fb));border-color:var(--ks-line,var(--border-color,#d7e6ef))}
.knowstack-editor :is(input,textarea){background:var(--ks-input,var(--bg-tertiary,#dceef8))}
.knowstack-editor :is(input,textarea)::placeholder{color:var(--ds-placeholder-ink,var(--ks-muted,revert))}
.knowstack-editor footer,.knowstack-editor .km-mode-panel{border-color:var(--ks-line,var(--border-color,#d7e6ef))}
.knowstack-memory-confirm button{background:var(--ks-secondary,var(--bg-secondary,#eaf3fb));border-color:var(--ks-line,var(--border-color,#d7e6ef))}
.knowstack-settings .ks-done,.knowstack-editor .km-save,.knowstack-memory-confirm .km-confirm-accept{background:var(--ks-accent,#117bb4);color:var(--ks-accent-ink,white)}
.knowstack-settings .ks-switch{background:var(--ks-track,#afc2d1)}
.knowstack-settings .ks-switch[aria-checked=true]{background:var(--ks-accent,#117bb4)}
.knowstack-editor .km-mode-switch{background:var(--ks-track,var(--text-muted,#9baebe))}
.knowstack-editor .km-mode-switch[aria-checked=true]{background:var(--ks-accent,var(--accent-color,#117bb4))}
.knowstack-settings .ks-switch span,.knowstack-editor .km-mode-switch span{background:var(--ks-knob-off,white)}
.knowstack-settings .ks-switch[aria-checked=true] span,.knowstack-editor .km-mode-switch[aria-checked=true] span{background:var(--ks-knob-on,white)}
.knowstack-editor .km-delete:hover{background:var(--ks-input,var(--bg-tertiary,#e0eaf2));color:var(--ks-danger,var(--danger-color,#c44545))}
.km-docked .km-icon-action:hover{background:var(--ks-input,var(--bg-tertiary,#e0eaf2))}
.knowstack-settings .ks-error{color:var(--ks-danger,#b23c32)}
.knowstack-editor .km-error{color:var(--ks-danger,var(--text-primary,#9e382d));background:var(--ks-secondary,var(--bg-secondary,#fff1ec));border-left-color:var(--ks-danger,#b75748)}
.knowstack-editor .km-highlight{border-color:var(--ks-warning,#b78320);box-shadow:inset 3px 0 var(--ks-warning,#b78320)}
.knowstack-editor .km-highlight::before{color:var(--ks-warning,var(--text-primary,#735012))}
.knowstack-memory{border-left-color:var(--ks-accent,#315dab);color:var(--ks-ink,inherit)}
.knowstack-memory .knowstack-mode input{accent-color:var(--ks-accent,auto)}
.knowstack-memory .knowstack-head [data-state=saved]{color:var(--ds-success,#25745a)}
.knowstack-memory .knowstack-head [data-state=unverified]{color:var(--ks-warning,#9b6a16)}
.knowstack-outdated,.knowstack-outdated-final{border-left-color:var(--ks-warning,#b78320)}
.knowstack-outdated .knowstack-head strong,.knowstack-outdated-final .ko-badge{color:var(--ks-ink,var(--text-primary,#735012))}
.knowstack-outdated .ko-original{border-left-color:var(--ks-line,var(--border-color,#d7e6ef))}
.knowstack-outdated-final{background:var(--ks-secondary,var(--bg-secondary,#f4f8fc));border-top-color:var(--ks-line,var(--border-color,#d7e6ef));border-right-color:var(--ks-line,var(--border-color,#d7e6ef));border-bottom-color:var(--ks-line,var(--border-color,#d7e6ef))}
.knowstack-outdated-final .ko-icon{color:var(--ks-warning,#b78320)}
.knowstack-outdated-final .knowstack-actions button{background:var(--ks-panel,var(--bg-primary,#f7fbff));border-color:var(--ks-line,var(--border-color,#c6d8e6))}
.knowstack-outdated-final .knowstack-actions button:first-child{border-color:var(--ks-warning,#b78320)}
.knowstack-settings-backdrop,.knowstack-editor-backdrop:not(.km-docked){background:var(--ds-scrim,rgba(20,46,65,.32))}
.knowstack-confirm-backdrop{background:var(--ds-scrim,rgba(20,46,65,.3))}
.knowstack-settings button:focus-visible,.knowstack-editor :is(button,input,textarea,select):focus-visible,.knowstack-memory-confirm button:focus-visible{outline-color:var(--ds-focus,#1689bf)}
.knowstack-memory .knowstack-actions button:focus-visible,.knowstack-memory .knowstack-mode input:focus-visible{outline-color:var(--ds-focus,#315dab)}
`;
