/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bgPrimary: "#0a0e1a",
        bgCard: "#1a1f35",
        bgInput: "#0d1225",
        accent: "#6366f1",
        accentLight: "#818cf8",
      },
      keyframes: {
        fadeInUp: {
          "0%": {opacity: "0", transform: "translateY(24px)"},
          "100%": {opacity: "1", transform: "translateY(0)"},
        },
        slideInRight: {
          "0%": {opacity: "0", transform: "translateX(40px)"},
          "100%": {opacity: "1", transform: "translateX(0)"},
        },
        slideOutRight: {
          "0%": {opacity: "1", transform: "translateX(0)"},
          "100%": {opacity: "0", transform: "translateX(40px)"},
        },
        pulseRing: {
          "0%, 100%": {transform: "scale(0.85)", opacity: "0.6"},
          "50%": {transform: "scale(1.15)", opacity: "0.15"},
        },
        pulseRingDelay: {
          "0%, 100%": {transform: "scale(0.9)", opacity: "0.4"},
          "50%": {transform: "scale(1.25)", opacity: "0.08"},
        },
        scan: {
          "0%": {top: "8%", opacity: "0"},
          "10%": {opacity: "1"},
          "90%": {opacity: "1"},
          "100%": {top: "88%", opacity: "0"},
        },
        successPop: {
          "0%": {transform: "scale(0)", opacity: "0"},
          "50%": {transform: "scale(1.2)"},
          "100%": {transform: "scale(1)", opacity: "1"},
        },
        float: {
          "0%, 100%": {transform: "translateY(0)"},
          "50%": {transform: "translateY(-6px)"},
        },
        progress: {
          from: {width: "100%"},
          to: {width: "0%"},
        },
        shake: {
          "0%, 100%": {transform: "translateX(0)"},
          "15%, 45%, 75%": {transform: "translateX(-4px)"},
          "30%, 60%, 90%": {transform: "translateX(4px)"},
        },
      },
      animation: {
        "fade-in-up": "fadeInUp 0.5s ease both",
        "fade-in-up-delay": "fadeInUp 0.5s ease 0.1s both",
        "slide-in-right": "slideInRight 0.35s ease both",
        "slide-out-right": "slideOutRight 0.35s ease both",
        "pulse-ring": "pulseRing 2s ease-in-out infinite",
        "pulse-ring-delay": "pulseRingDelay 2s ease-in-out infinite 0.4s",
        "scan": "scan 2s ease-in-out infinite",
        "success-pop": "successPop 0.5s ease both",
        "float": "float 4s ease-in-out infinite",
        "progress-bar": "progress linear forwards",
        "shake": "shake 0.4s ease-in-out",
        "spin-slow": "spin 0.7s linear infinite",
      },
    },
  },
  plugins: [],
};
