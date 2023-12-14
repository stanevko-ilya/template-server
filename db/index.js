const fs = require('fs');
const { logger } = require('../modules');
const path = require('path');
const { Model } = require('mongoose');

class DB {

    /** Модуль для работы с БД */
    mongoose = require('mongoose');
    is_work() { return this.mongoose.connection.readyState === 1 }

    /** Конфиг базы данных */
    config = require('./config.json');

    /**
     * @type {Object.<string, Model<any, unknown, unknown, unknown, any, any>>}
     * @description Модели
     */
    models = {};

    /** Инициализация схем базы */
    init_models() {
        const path_schemes = path.join(__dirname, 'schemes');
        const files = fs.readdirSync(path_schemes).filter(file => path.extname(file) === '.js');
        for (let i = 0; i < files.length; i++) {
            const scheme = require(path.join(path_schemes, files[i]));
            if (scheme instanceof this.mongoose.Schema) {
                const split = files[i].split('.');
                const name = split.slice(0, split.length - 1).join('.');
                this.models[name] = this.mongoose.model(name, scheme);;
            }
        }
    }

    /** Подключение к базе данных */
    start() {
        this.mongoose = require('mongoose');
        this.models = {};

        this.mongoose.connect(this.config.url)
            .then(() => {
                logger.log('info', 'Система БД запущена');
                try {
                    this.init_models();
                } catch (e) {
                    logger.log('error', 'Ошибка при инициализации схем БД');
                    logger.log('info', e);
                }
            })
            .catch(e => {
                logger.log('error', 'Ошибка при подключение к БД')
                logger.log('info', e);
            })
        ;
        
    }

    /** ОТключение базы данных */
    stop() {
        this.mongoose.disconnect();
        logger.log('info', 'Система БД отключена')
    }

}

module.exports = DB