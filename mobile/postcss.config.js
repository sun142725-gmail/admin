export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {
      overrideBrowserslist: ['Android >= 4.0', 'iOS >= 8']
    },
    'postcss-pxtorem': {
      rootValue: 37.5,
      propList: ['*'],
      selectorBlackList: ['.norem'],
      // node_modules 不转；shared/styles/base.css 是多分辨率 shell，
      // html font-size 封顶值必须保持 px（转 rem 会自引用失效）
      exclude: /(node_modules)|(shared[\\/]styles[\\/]base\.css$)/i
    }
  }
}
