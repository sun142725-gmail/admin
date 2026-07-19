const modules = import.meta.glob('./*.vue', { eager: true })

export default {
  install(app) {
    Object.entries(modules).forEach(([path, module]) => {
      const name = path.replace(/^\.\/(.*)\.vue$/, '$1')
      app.component(name, module.default)
    })
  }
}
