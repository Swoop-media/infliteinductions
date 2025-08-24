/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/app/learn/quiz/:id',
        destination: '/app/learn/quiz/modules/:id',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
