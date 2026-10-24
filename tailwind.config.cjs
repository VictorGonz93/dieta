/** Configuración de Tailwind para compilar CSS estático (v126). */
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        primary: '#10B981',
        accent: '#60A5FA',
        success: '#10B981',
      },
    },
  },
  plugins: [],
};
