import { randomBytes } from 'node:crypto';

export async function generateId(validator: (id: string) => boolean | Promise<boolean> = () => true): Promise<string> {
    const id = randomBytes(8).toString('hex');
    if (await validator(id)) return id;
    return generateId(validator);
}

export default generateId;
