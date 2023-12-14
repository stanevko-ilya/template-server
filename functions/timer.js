const bit32 = 2147483647;
function timer(func, hours=0, minutes=0, seconds=0, miliseconds=0, custimize=(date, next_date)=>{}) {
    // Получаем дату следующего запуска
    const date = new Date();
    const next_date = new Date();
    next_date.setUTCHours(hours, minutes, seconds, miliseconds);
    if (next_date.getTime() <= date.getTime()) next_date.setUTCDate(date.getUTCDate() + 1); 
    custimize(date, next_date);

    const ms = next_date.getTime() - date.getTime(); // Миллисекунды до запуска

    function main_timer(delay) {
        setTimeout(async () => {
            await func(); // Запуск функции
            timer(func, hours, minutes, seconds, miliseconds, custimize); // Перезапуск таймера
        }, delay);
    }

    if (bit32 < ms) {
        let repeats = Math.floor((ms - bit32)/bit32);
        const remains = ms - bit32 * repeats;
        
        function pre_timer() {
            setTimeout(() => {
                if (repeats === 0) main_timer(remains);
                else {
                    repeats--;
                    pre_timer();
                }
            }, bit32);
        }
        pre_timer();
    } else main_timer(ms);
}

module.exports = timer;