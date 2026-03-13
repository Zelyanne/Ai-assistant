import Button from 'primevue/button';
import Card from 'primevue/card';
import { useRouter } from 'vue-router';
const router = useRouter();
const features = [
    {
        title: 'Autonomous Triage',
        description: 'The engine handles routine follow-ups and coordination while you sleep.',
        icon: '🧠',
        color: 'bg-teal-50',
        iconColor: 'text-teal-600',
        border: 'border-teal-100'
    },
    {
        title: 'Agency Perimeters',
        description: 'Define exactly where the AI can act and where it must escalate to you.',
        icon: '🛡️',
        color: 'bg-indigo-50',
        iconColor: 'text-indigo-600',
        border: 'border-indigo-100'
    },
    {
        title: 'Source Citations',
        description: 'Every assertion includes deep-links to original sources for total verifiability.',
        icon: '🔗',
        color: 'bg-blue-50',
        iconColor: 'text-blue-600',
        border: 'border-blue-100'
    }
];
const navigateToLogin = () => {
    router.push('/login');
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "min-h-screen bg-executive-background font-sans text-executive-primary selection:bg-executive-primary/10 relative overflow-hidden" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200/20 blur-[120px] rounded-full -z-10 animate-pulse" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-teal-200/20 blur-[100px] rounded-full -z-10" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "h-20 flex items-center justify-between px-8 lg:px-16 bg-white/60 backdrop-blur-xl sticky top-0 z-50 border-b border-white/20 shadow-sm" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "h-10 w-10 bg-gradient-to-br from-executive-primary to-slate-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-white font-bold text-xl" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-executive-primary to-slate-600" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-6" },
});
const __VLS_0 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    label: "Login",
    severity: "secondary",
    text: true,
    ...{ class: "!font-medium" },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    label: "Login",
    severity: "secondary",
    text: true,
    ...{ class: "!font-medium" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.navigateToLogin)
};
var __VLS_3;
const __VLS_8 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ 'onClick': {} },
    label: "Get Started",
    severity: "contrast",
    ...{ class: "!px-6 !rounded-full shadow-md hover:shadow-lg transition-shadow" },
}));
const __VLS_10 = __VLS_9({
    ...{ 'onClick': {} },
    label: "Get Started",
    severity: "contrast",
    ...{ class: "!px-6 !rounded-full shadow-md hover:shadow-lg transition-shadow" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_12;
let __VLS_13;
let __VLS_14;
const __VLS_15 = {
    onClick: (__VLS_ctx.navigateToLogin)
};
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "py-20 lg:py-32 px-8 lg:px-16 flex flex-col items-center text-center relative" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "max-w-4xl space-y-10 relative z-10" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/50 backdrop-blur-sm border border-white shadow-sm text-executive-primary text-xs font-bold uppercase tracking-widest" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "relative flex h-2 w-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "animate-ping absolute inline-flex h-full w-full rounded-full bg-executive-success opacity-75" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
    ...{ class: "relative inline-flex rounded-full h-2 w-2 bg-executive-success" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "text-6xl lg:text-8xl font-black leading-[1.05] tracking-tight text-executive-primary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-indigo-500 to-teal-500" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.br, __VLS_intrinsicElements.br)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "text-slate-400/70" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-lg lg:text-xl text-slate-500/90 max-w-2xl mx-auto font-technical leading-relaxed" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col sm:flex-row items-center justify-center gap-5 pt-6" },
});
const __VLS_16 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onClick': {} },
    label: "Experience the Hub",
    severity: "contrast",
    ...{ class: "!px-10 !py-4 !text-lg !rounded-full shadow-xl shadow-executive-primary/20 hover:-translate-y-0.5 transition-transform" },
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClick': {} },
    label: "Experience the Hub",
    severity: "contrast",
    ...{ class: "!px-10 !py-4 !text-lg !rounded-full shadow-xl shadow-executive-primary/20 hover:-translate-y-0.5 transition-transform" },
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onClick: (__VLS_ctx.navigateToLogin)
};
var __VLS_19;
const __VLS_24 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "Watch the Vision",
    severity: "secondary",
    outlined: true,
    ...{ class: "!px-10 !py-4 !text-lg !rounded-full bg-white/30 backdrop-blur-sm" },
}));
const __VLS_26 = __VLS_25({
    label: "Watch the Vision",
    severity: "secondary",
    outlined: true,
    ...{ class: "!px-10 !py-4 !text-lg !rounded-full bg-white/30 backdrop-blur-sm" },
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mt-20 w-full max-w-5xl aspect-[16/10] rounded-[2.5rem] bg-gradient-to-b from-white to-slate-50 border border-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] overflow-hidden relative group" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "absolute inset-0 flex items-center justify-center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(51,65,85,0.03),transparent)]" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "text-slate-300 font-technical text-sm flex flex-col items-center gap-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "w-20 h-20 rounded-full border-4 border-slate-100 border-t-indigo-300 animate-spin" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "absolute top-12 left-12 w-72 h-40 bg-white/80 backdrop-blur-md border border-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] transform -rotate-2 group-hover:rotate-0 group-hover:scale-105 transition-all duration-700 p-6 space-y-4" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex items-center gap-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-600 font-bold" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "h-3 w-32 bg-slate-100 rounded-full" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "h-2 w-full bg-slate-100/50 rounded-full" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "h-2 w-4/5 bg-slate-100/50 rounded-full" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "absolute bottom-16 right-16 w-80 h-56 bg-white/90 backdrop-blur-md border border-white rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.08)] transform rotate-3 group-hover:rotate-0 group-hover:scale-105 transition-all duration-700 p-8" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "h-4 w-40 bg-indigo-500/10 rounded-full mb-6" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-3" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "h-2.5 w-full bg-slate-100 rounded-full" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "h-2.5 w-full bg-slate-100 rounded-full" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "h-2.5 w-2/3 bg-slate-100 rounded-full" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mt-24 flex flex-col items-center gap-8 opacity-40 grayscale contrast-125" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-xs font-bold uppercase tracking-[0.3em] text-slate-400" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-wrap justify-center gap-x-16 gap-y-8 text-xl font-black italic tracking-tighter" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "py-32 bg-white relative" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-executive-background to-white" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "max-w-6xl mx-auto space-y-20 relative px-8" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "text-center space-y-5" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "text-4xl lg:text-5xl font-bold tracking-tight text-executive-primary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-slate-500 max-w-xl mx-auto text-lg font-technical" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "grid grid-cols-1 md:grid-cols-3 gap-10" },
});
for (const [feature] of __VLS_getVForSourceType((__VLS_ctx.features))) {
    const __VLS_28 = {}.Card;
    /** @type {[typeof __VLS_components.Card, typeof __VLS_components.Card, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        key: (feature.title),
        ...{ class: "!border-none !shadow-none !bg-transparent hover:-translate-y-2 transition-all duration-300" },
    }));
    const __VLS_30 = __VLS_29({
        key: (feature.title),
        ...{ class: "!border-none !shadow-none !bg-transparent hover:-translate-y-2 transition-all duration-300" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    {
        const { content: __VLS_thisSlot } = __VLS_31.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: (['space-y-6 p-10 rounded-[2rem] border transition-all duration-300 group', feature.color, feature.border, 'hover:shadow-xl hover:shadow-indigo-500/5']) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: (['w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-sm bg-white', feature.iconColor]) },
        });
        (feature.icon);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "space-y-3" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "text-2xl font-bold text-executive-primary" },
        });
        (feature.title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "text-slate-600 font-technical leading-relaxed" },
        });
        (feature.description);
    }
    var __VLS_31;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "py-32 px-8 lg:px-16 bg-slate-50/50" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "max-w-6xl mx-auto space-y-24" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "text-center max-w-3xl mx-auto space-y-8" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "text-5xl text-indigo-200" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
    ...{ class: "text-3xl lg:text-4xl font-medium italic leading-snug text-executive-primary tracking-tight" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col items-center gap-2" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "text-sm font-black uppercase tracking-widest text-executive-primary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "text-xs font-bold text-slate-400 uppercase tracking-widest" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "relative overflow-hidden bg-executive-primary rounded-[3rem] p-12 lg:p-20 text-white shadow-2xl shadow-indigo-900/40" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
    ...{ class: "absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-400/10 to-transparent" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "relative z-10 flex flex-col lg:flex-row items-center justify-between gap-12" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "space-y-6 max-w-xl text-center lg:text-left" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "text-4xl lg:text-5xl font-bold leading-tight" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-indigo-100 text-lg font-technical" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex flex-col gap-4 w-full lg:w-auto min-w-[320px]" },
});
const __VLS_32 = {}.Button;
/** @type {[typeof __VLS_components.Button, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "Request Private Beta Access",
    severity: "secondary",
    ...{ class: "!w-full !rounded-full !py-4 !bg-white !text-executive-primary !border-none !text-lg !font-bold shadow-lg" },
}));
const __VLS_34 = __VLS_33({
    label: "Request Private Beta Access",
    severity: "secondary",
    ...{ class: "!w-full !rounded-full !py-4 !bg-white !text-executive-primary !border-none !text-lg !font-bold shadow-lg" },
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "text-center text-xs text-indigo-300 font-technical" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
    ...{ class: "mt-32 pt-12 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-6 text-xs text-slate-400 font-technical uppercase tracking-widest" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "flex gap-10" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
    href: "#",
    ...{ class: "hover:text-executive-primary transition-colors" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
    href: "#",
    ...{ class: "hover:text-executive-primary transition-colors" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
    href: "#",
    ...{ class: "hover:text-executive-primary transition-colors" },
});
/** @type {__VLS_StyleScopedClasses['min-h-screen']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-executive-background']} */ ;
/** @type {__VLS_StyleScopedClasses['font-sans']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['selection:bg-executive-primary/10']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['top-[-10%]']} */ ;
/** @type {__VLS_StyleScopedClasses['left-[-10%]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[40%]']} */ ;
/** @type {__VLS_StyleScopedClasses['h-[40%]']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-indigo-200/20']} */ ;
/** @type {__VLS_StyleScopedClasses['blur-[120px]']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['-z-10']} */ ;
/** @type {__VLS_StyleScopedClasses['animate-pulse']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-[10%]']} */ ;
/** @type {__VLS_StyleScopedClasses['right-[-5%]']} */ ;
/** @type {__VLS_StyleScopedClasses['w-[30%]']} */ ;
/** @type {__VLS_StyleScopedClasses['h-[30%]']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-teal-200/20']} */ ;
/** @type {__VLS_StyleScopedClasses['blur-[100px]']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['-z-10']} */ ;
/** @type {__VLS_StyleScopedClasses['h-20']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['px-8']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:px-16']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white/60']} */ ;
/** @type {__VLS_StyleScopedClasses['backdrop-blur-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky']} */ ;
/** @type {__VLS_StyleScopedClasses['top-0']} */ ;
/** @type {__VLS_StyleScopedClasses['z-50']} */ ;
/** @type {__VLS_StyleScopedClasses['border-b']} */ ;
/** @type {__VLS_StyleScopedClasses['border-white/20']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['h-10']} */ ;
/** @type {__VLS_StyleScopedClasses['w-10']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-gradient-to-br']} */ ;
/** @type {__VLS_StyleScopedClasses['from-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['to-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-indigo-500/20']} */ ;
/** @type {__VLS_StyleScopedClasses['text-white']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-clip-text']} */ ;
/** @type {__VLS_StyleScopedClasses['text-transparent']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-gradient-to-r']} */ ;
/** @type {__VLS_StyleScopedClasses['from-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['to-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-6']} */ ;
/** @type {__VLS_StyleScopedClasses['!font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['!px-6']} */ ;
/** @type {__VLS_StyleScopedClasses['!rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-md']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:shadow-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-shadow']} */ ;
/** @type {__VLS_StyleScopedClasses['py-20']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:py-32']} */ ;
/** @type {__VLS_StyleScopedClasses['px-8']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:px-16']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-4xl']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-10']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['z-10']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white/50']} */ ;
/** @type {__VLS_StyleScopedClasses['backdrop-blur-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-white']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-widest']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-2']} */ ;
/** @type {__VLS_StyleScopedClasses['w-2']} */ ;
/** @type {__VLS_StyleScopedClasses['animate-ping']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-flex']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-executive-success']} */ ;
/** @type {__VLS_StyleScopedClasses['opacity-75']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-flex']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-2']} */ ;
/** @type {__VLS_StyleScopedClasses['w-2']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-executive-success']} */ ;
/** @type {__VLS_StyleScopedClasses['text-6xl']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:text-8xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-black']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-[1.05]']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-clip-text']} */ ;
/** @type {__VLS_StyleScopedClasses['text-transparent']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-gradient-to-r']} */ ;
/** @type {__VLS_StyleScopedClasses['from-indigo-600']} */ ;
/** @type {__VLS_StyleScopedClasses['via-indigo-500']} */ ;
/** @type {__VLS_StyleScopedClasses['to-teal-500']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400/70']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500/90']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['sm:flex-row']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-5']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-6']} */ ;
/** @type {__VLS_StyleScopedClasses['!px-10']} */ ;
/** @type {__VLS_StyleScopedClasses['!py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['!text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['!rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-executive-primary/20']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:-translate-y-0.5']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-transform']} */ ;
/** @type {__VLS_StyleScopedClasses['!px-10']} */ ;
/** @type {__VLS_StyleScopedClasses['!py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['!text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['!rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white/30']} */ ;
/** @type {__VLS_StyleScopedClasses['backdrop-blur-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-20']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-5xl']} */ ;
/** @type {__VLS_StyleScopedClasses['aspect-[16/10]']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[2.5rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-gradient-to-b']} */ ;
/** @type {__VLS_StyleScopedClasses['from-white']} */ ;
/** @type {__VLS_StyleScopedClasses['to-slate-50']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-white']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)]']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['group']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['inset-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-[radial-gradient(circle_at_50%_50%,rgba(51,65,85,0.03),transparent)]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-300']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['w-20']} */ ;
/** @type {__VLS_StyleScopedClasses['h-20']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['border-4']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t-indigo-300']} */ ;
/** @type {__VLS_StyleScopedClasses['animate-spin']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['top-12']} */ ;
/** @type {__VLS_StyleScopedClasses['left-12']} */ ;
/** @type {__VLS_StyleScopedClasses['w-72']} */ ;
/** @type {__VLS_StyleScopedClasses['h-40']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white/80']} */ ;
/** @type {__VLS_StyleScopedClasses['backdrop-blur-md']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-white']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-3xl']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-[0_20px_50px_rgba(0,0,0,0.05)]']} */ ;
/** @type {__VLS_StyleScopedClasses['transform']} */ ;
/** @type {__VLS_StyleScopedClasses['-rotate-2']} */ ;
/** @type {__VLS_StyleScopedClasses['group-hover:rotate-0']} */ ;
/** @type {__VLS_StyleScopedClasses['group-hover:scale-105']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-all']} */ ;
/** @type {__VLS_StyleScopedClasses['duration-700']} */ ;
/** @type {__VLS_StyleScopedClasses['p-6']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-4']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-3']} */ ;
/** @type {__VLS_StyleScopedClasses['w-10']} */ ;
/** @type {__VLS_StyleScopedClasses['h-10']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-teal-500/10']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-teal-600']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['h-3']} */ ;
/** @type {__VLS_StyleScopedClasses['w-32']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['h-2']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-100/50']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-2']} */ ;
/** @type {__VLS_StyleScopedClasses['w-4/5']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-100/50']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-16']} */ ;
/** @type {__VLS_StyleScopedClasses['right-16']} */ ;
/** @type {__VLS_StyleScopedClasses['w-80']} */ ;
/** @type {__VLS_StyleScopedClasses['h-56']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white/90']} */ ;
/** @type {__VLS_StyleScopedClasses['backdrop-blur-md']} */ ;
/** @type {__VLS_StyleScopedClasses['border']} */ ;
/** @type {__VLS_StyleScopedClasses['border-white']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-3xl']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-[0_30px_60px_rgba(0,0,0,0.08)]']} */ ;
/** @type {__VLS_StyleScopedClasses['transform']} */ ;
/** @type {__VLS_StyleScopedClasses['rotate-3']} */ ;
/** @type {__VLS_StyleScopedClasses['group-hover:rotate-0']} */ ;
/** @type {__VLS_StyleScopedClasses['group-hover:scale-105']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-all']} */ ;
/** @type {__VLS_StyleScopedClasses['duration-700']} */ ;
/** @type {__VLS_StyleScopedClasses['p-8']} */ ;
/** @type {__VLS_StyleScopedClasses['h-4']} */ ;
/** @type {__VLS_StyleScopedClasses['w-40']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-indigo-500/10']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-3']} */ ;
/** @type {__VLS_StyleScopedClasses['h-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-2.5']} */ ;
/** @type {__VLS_StyleScopedClasses['w-2/3']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-100']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-24']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-8']} */ ;
/** @type {__VLS_StyleScopedClasses['opacity-40']} */ ;
/** @type {__VLS_StyleScopedClasses['grayscale']} */ ;
/** @type {__VLS_StyleScopedClasses['contrast-125']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-[0.3em]']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-x-16']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-y-8']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-black']} */ ;
/** @type {__VLS_StyleScopedClasses['italic']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tighter']} */ ;
/** @type {__VLS_StyleScopedClasses['py-32']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['top-0']} */ ;
/** @type {__VLS_StyleScopedClasses['left-0']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-32']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-gradient-to-b']} */ ;
/** @type {__VLS_StyleScopedClasses['from-executive-background']} */ ;
/** @type {__VLS_StyleScopedClasses['to-white']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-6xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-20']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['px-8']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-4xl']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:text-5xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-500']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['grid']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-cols-1']} */ ;
/** @type {__VLS_StyleScopedClasses['md:grid-cols-3']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-10']} */ ;
/** @type {__VLS_StyleScopedClasses['!border-none']} */ ;
/** @type {__VLS_StyleScopedClasses['!shadow-none']} */ ;
/** @type {__VLS_StyleScopedClasses['!bg-transparent']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:-translate-y-2']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-all']} */ ;
/** @type {__VLS_StyleScopedClasses['duration-300']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-3']} */ ;
/** @type {__VLS_StyleScopedClasses['text-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-600']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-relaxed']} */ ;
/** @type {__VLS_StyleScopedClasses['py-32']} */ ;
/** @type {__VLS_StyleScopedClasses['px-8']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:px-16']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-slate-50/50']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-6xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-24']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-3xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-8']} */ ;
/** @type {__VLS_StyleScopedClasses['text-5xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-indigo-200']} */ ;
/** @type {__VLS_StyleScopedClasses['text-3xl']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:text-4xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['italic']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-snug']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['font-black']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-widest']} */ ;
/** @type {__VLS_StyleScopedClasses['text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-widest']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-[3rem]']} */ ;
/** @type {__VLS_StyleScopedClasses['p-12']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:p-20']} */ ;
/** @type {__VLS_StyleScopedClasses['text-white']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-2xl']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-indigo-900/40']} */ ;
/** @type {__VLS_StyleScopedClasses['absolute']} */ ;
/** @type {__VLS_StyleScopedClasses['top-0']} */ ;
/** @type {__VLS_StyleScopedClasses['right-0']} */ ;
/** @type {__VLS_StyleScopedClasses['w-1/2']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-gradient-to-l']} */ ;
/** @type {__VLS_StyleScopedClasses['from-indigo-400/10']} */ ;
/** @type {__VLS_StyleScopedClasses['to-transparent']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['z-10']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:flex-row']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-12']} */ ;
/** @type {__VLS_StyleScopedClasses['space-y-6']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:text-left']} */ ;
/** @type {__VLS_StyleScopedClasses['text-4xl']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:text-5xl']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['leading-tight']} */ ;
/** @type {__VLS_StyleScopedClasses['text-indigo-100']} */ ;
/** @type {__VLS_StyleScopedClasses['text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-4']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['lg:w-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['min-w-[320px]']} */ ;
/** @type {__VLS_StyleScopedClasses['!w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['!rounded-full']} */ ;
/** @type {__VLS_StyleScopedClasses['!py-4']} */ ;
/** @type {__VLS_StyleScopedClasses['!bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['!text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['!border-none']} */ ;
/** @type {__VLS_StyleScopedClasses['!text-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['!font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-indigo-300']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-32']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-12']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-slate-200']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['md:flex-row']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-between']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-6']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-slate-400']} */ ;
/** @type {__VLS_StyleScopedClasses['font-technical']} */ ;
/** @type {__VLS_StyleScopedClasses['uppercase']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-widest']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-10']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-executive-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Button: Button,
            Card: Card,
            features: features,
            navigateToLogin: navigateToLogin,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=Landing.vue.js.map