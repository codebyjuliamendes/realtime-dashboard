/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: ['./public/**/*.html', './public/js/**/*.js'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
            },
        },
    },
    plugins: [],
};
