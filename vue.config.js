'use strict'
const path = require('path')
const defaultSettings = require('./src/settings.js')

function resolve(dir) {
  return path.join(__dirname, dir)
}

const name = defaultSettings.title // 网址标题
const port = 8013 // 端口配置

// All configuration item explanations can be find in https://cli.vuejs.org/config/
module.exports = {
  // hash 模式下可使用
  // publicPath: process.env.NODE_ENV === 'development' ? '/' : './',
  publicPath: '/',
  // 当运行 vue-cli-service build 时生成的生产环境构建文件的目录。注意目标目录在构建之前会被清除 (构建时传入 --no-clean 可关闭该行为)。
  outputDir: 'dist',
  // 放置生成的静态资源 (js、css、img、fonts) 的 (相对于 outputDir 的) 目录
  assetsDir: 'static',
  // 如果嫌格式检查每次构建都提示很烦
  lintOnSave: process.env.NODE_ENV === 'development',
  // 是否生成源码地图,false 关闭可以加速打包速度
  productionSourceMap: false,

  devServer: {
    port: port,
    open: true,
    overlay: {
      warnings: false,
      errors: true
    },
    proxy: {
      '/api': {
        target: process.env.VUE_APP_BASE_API,
        changeOrigin: true,
        pathRewrite: {
          '^/api': 'api'
        }
      },
      '/auth': {
        target: process.env.VUE_APP_BASE_API,
        changeOrigin: true,
        pathRewrite: {
          '^/auth': 'auth'
        }
      }
    }
  },
  //1> 除了上述使用 chainWebpack 来改变 webpack 内部配置外，我们还可以使用 configureWebpack 来进行修改，两者的不同点在于 chainWebpack 是链式修改，而 configureWebpack 更倾向于整体替换和修改
  // 2>configureWebpack 可以直接是一个对象，也可以是一个函数，如果是对象它会直接使用 webpack-merge 对其进行合并处理，如果是函数，你可以直接使用其 config 参数来修改 webpack 中的配置，或者返回一个对象来进行 merge 处理。
  configureWebpack: config => {

    return {
      // provide the app's title in webpack's name field, so that
      // it can be accessed in index.html to inject the correct title.
      // name 是配置的名称，在加载多个配置时有用
      name: name,
      // alias 可以配置快捷引用，我们也可以配置更多快捷引用1111111222
      resolve: {
        alias: {
          '@': resolve('src'),
          '@crud': resolve('src/components/Crud')
        }
      },
      optimization: {
        minimize: false,//设置false将打包的代码不进行混淆编译
        minimizer: [
          //minimize可以设置true,
          //然后可以这里参照TerserPlugin文档修改一些更细节的配置
        ]
      }
    }
  },

  // chainWebpack 配置项允许我们更细粒度的控制 webpack 的内部配置，其集成的是 webpack-chain这一插件，该插件可以让我们能够使用链式操作来修改配置，比如：
  // chainWebpack: config => {
  chainWebpack(config) {
    config.plugins.delete('preload'); // TODO: need test
    config.plugins.delete('prefetch'); // TODO: need test

    // set svg-sprite-loader

    //1> svg-sprite-loader实际上是把所有的svg打包成一张雪 碧图，类似下图。每一个symbol装置对应的icon，
    //2> 再通过<use xlink:href="#xxx"/>来显示你所需的icon。
    // 删除配置中的svg
    config.module
      .rule('svg')
      .exclude.add(resolve('src/assets/icons'))
      .end();
    // 重新配置svg
    config.module
      .rule('icons')
      .test(/\.svg$/)
      .include.add(resolve('src/assets/icons'))
      .end()
      .use('svg-sprite-loader')
      .loader('svg-sprite-loader')
      .options({
        symbolId: 'icon-[name]'
      })
      .end();

    // set preserveWhitespace
    config.module
      .rule('vue')
      .use('vue-loader')
      .loader('vue-loader')
      .tap(options => {
        // vue 去掉元素之间空格 preserveWhitespace
        options.compilerOptions.preserveWhitespace = true
        return options
      })
      .end();

    config
      // https://webpack.js.org/configuration/devtool/#development
      .when(process.env.NODE_ENV === 'development',
        config => config.devtool('cheap-source-map')
      );

    config
      .when(process.env.NODE_ENV !== 'development',
        config => {
          config
            .plugin('ScriptExtHtmlWebpackPlugin')
            .after('html')
            .use('script-ext-html-webpack-plugin', [{
              // `runtime` must same as runtimeChunk name. default is `runtime`
              inline: /runtime\..*\.js$/
            }])
            .end();

          // 如果使用了某些长期不会改变的库，像 element-ui ，打包完成有 600 多 KB ，包含在默认 vendor 中显然不合适，每次用户都要加载这么大的文件体验不好，所以要单独打包：
          config
            .optimization.splitChunks({
              chunks: 'all',
              cacheGroups: {
                libs: {
                  name: 'chunk-libs',
                  test: /[\\/]node_modules[\\/]/,
                  priority: 10,
                  chunks: 'initial' // only package third parties that are initially dependent
                },
                elementUI: {
                  name: 'chunk-elementUI', // split elementUI into a single package
                  priority: 20, // the weight needs to be larger than libs and app or it will be packaged into libs or app
                  test: /[\\/]node_modules[\\/]_?element-ui(.*)/ // in order to adapt to cnpm
                },
                commons: {
                  name: 'chunk-commons',
                  test: resolve('src/components'), // can customize your rules
                  minChunks: 3, //  minimum common number
                  priority: 5,
                  reuseExistingChunk: true
                }
              }
            });

          /***
           1>根据路由驱动页面的 runtime 代码默认情况是包含在 build 后的 app.hash.js 内的，如果我们改动其他路由，就会导致 runtime 代码改变。从而不光我们改动的路由对应的页面 js 会变，含 runtime 代码的 app.hash.js 也会变，对用户体验是非常不友好的。
           2>为了解决这个问题要设定 runtime 代码单独抽取打包
           3>但是 runtime 代码由于只是驱动不同路由页面的关系，代码量比较少，请求 js 的时间都大于执行时间了，所以使用 script-ext-html-webpack-plugin 插件将其内链在 index.html 中比较友好。
          ***/
          config.optimization.runtimeChunk('single');
        }
      )
  },
  transpileDependencies: [
    'vue-echarts',
    'resize-detector'
  ]
}
