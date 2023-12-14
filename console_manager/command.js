const chalk = require('@kitsune-labs/chalk-node');
const config = require('./config.json');

class Command {

    /** Ключевая фраза */
    name;
    /**
     * 
     * @returns {String} Ключевая фраза
     */
    get_name() { return this.name };

    /** Описание функционала */
    description;

    /** Праметры, которые принимает команда */
    parameters;
    /**
     * 
     * @returns {[{ name: String, type: *, description: String, required: Boolean }]} Список принимаемых аргументов
     */
    get_parameneters() { return this.parameters };

    /** Флаги команды */
    flags;
    /**
     * 
     * @returns {[{ name: String, description: String }]} Список принимаемых флагов
     */
    get_flags() { return this.flags };

    /**
     * 
     * @param {Strign} name Ключевая фраза
     * @param {String} description Описание функционала
     * @param {Function} use Каллбэк, который будет вызываться для выполнения команды
     */
    constructor (name, description, use, options={ parameters: [], flags: [] }) {
        this.name = name;
        this.description = description;
        this.use = use;
        this.parameters = options.parameters ? options.parameters : [];
        this.flags = options.flags ? options.flags : [];
    }

    /**
     * 
     * @param {String} name Искомый флаг
     * @returns {Boolean} Может ли быть использован флаг в команде
     */
    valid_flag(name) { return Boolean(this.get_flags().find(value => value.name === name)) }

    /**
     * @param {String} name Любая ключевая фраза
     * @returns {Boolean} Является ли введеная команда текущей
     */
    check_name(name) { return this.get_name() === name }

    /**
     * @returns {String} Краткая информация о функции 
     */
    info() { return `${chalk.green(this.get_name())} - ${this.description}` }

    /**
     * @returns {String} Полная информация о функции 
     */
    help() {
        const parameters = this.get_parameneters();
        const strings = [
            `${chalk.green(this.get_name())}${parameters.map(parameter => ` ${chalk.yellow(`<${parameter.name}>`)}`).join('')} - ${this.description}`
        ];
        
        if (0 < parameters.length) {
            strings.push('');
            strings.push('Параметры:');
            let length_longest_parameter = 0;
            parameters.map(parameter => { if (length_longest_parameter < parameter.name.length) length_longest_parameter = parameter.name.length });

            for (let i = 0; i < parameters.length; i++) {
                const parameter = parameters[i];
                strings.push(`${' '.repeat(config.space_size)}${chalk.yellow(`<${parameter.name}>`)}${parameter.required ? '' : ' (опционально)'}${' '.repeat(length_longest_parameter - parameter.name.length + 1)}${parameter.description}`);
            }
        }

        const flags = this.get_flags();
        if (0 < flags.length) {
            strings.push('');
            strings.push('Флаги: ');
            let length_longest_flag = 0;
            flags.map(flag => { if (length_longest_flag < flag.name.length) length_longest_flag = flag.name.length });
            
            for (let i = 0; i < flags.length; i++) {
                const flag = flags[i];
                strings.push(`${' '.repeat(config.space_size)}${chalk.blueBright(flag.name)}${' '.repeat(length_longest_flag - flag.name.length + 1)}${flag.description}`);
            }
        }
        
        return strings;
    }

    /** Каллбэк, который будет вызываться для выполнения команды */
    use({ parameters, flags, current_interface, manager }) {}
}

module.exports = Command;