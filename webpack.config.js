const { resolve } = require("path");
const { env } = require("process");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const DtsBundleWebpackPlugin = require('dts-bundle-webpack');

const isProduction = env.NODE_ENV == 'production';
module.exports = {
    mode: isProduction ? 'production' : 'development',
    entry: {
        index: './src/index.ts',
        main: './src/main.ts',
        worker: './src/worker.ts'
    },
    output: {
        path: resolve(__dirname, 'dist'),
        filename: '[name].js',
        library: "ProcessHost",
        libraryTarget: 'umd',
        globalObject: 'this',
        umdNamedDefine: true
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/index.ejs',
            inject: 'body',
            chunks: ['main']
        }),
        new DtsBundleWebpackPlugin({
            name: '@lbfalvy/process-host',
            main: 'dist/decl/index.d.ts',
            removeSource: true,
        })
    ],
    resolve: {
        extensions: ['.js', '.ts']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: 'babel-loader',
                        options: {
                            targets: '> 0.25%, not dead',
                            inputSourceMap: !isProduction,
                            sourceMaps: isProduction ? false : 'inline'
                        }
                    },
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: 'tsconfig.json',
                            onlyCompileBundledFiles: true,
                        }
                    }
                ],
                exclude: /node_modules/
            },
        ]
    }
}