/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        natureGreen: "#2E7D32",     // Verde Natureza (Verde principal)
        fieldGreen: "#66BB6A",      // Verde Campo (Verde secundário)
        iotBlue: "#1976D2",         // Azul IoT (Azul tecnológico)
        trustBlue: "#263B5A",       // Azul Confiança (Azul escuro)
        offWhite: "#F5F7F2",        // Fundo Off-White
        graphiteText: "#263238",    // Texto Grafite (Texto principal)
        alertAmber: "#F9A825",      // Alerta Âmbar (Alerta / Atenção)
        criticalRed: "#D32F2F",     // Crítico Vermelho (Crítico / Urgente)
      }
    },
  },
  plugins: [],
}
