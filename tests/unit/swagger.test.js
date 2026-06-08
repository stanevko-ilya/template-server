const { buildSpec } = require('../../modules/api/swagger');

describe('swagger buildSpec', () => {
    const spec = buildSpec();

    it('возвращает валидную OpenAPI 3 спеку', () => {
        expect(spec.openapi).toBe('3.0.0');
        expect(spec.paths).toBeTypeOf('object');
    });

    it('включает зарегистрированные методы (ping)', () => {
        expect(spec.paths['/api/ping']).toBeDefined();
        expect(spec.paths['/api/ping'].get).toBeDefined();
    });

    it('использует JWT Bearer как схему авторизации (без VK)', () => {
        expect(spec.components.securitySchemes.BearerAuth).toBeDefined();
        expect(spec.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
        expect(spec.components.securitySchemes.VKMiniApp).toBeUndefined();
        expect(spec.components.securitySchemes.OKMiniApp).toBeUndefined();
    });

    it('содержит стандартные схемы ответов', () => {
        expect(spec.components.schemas.ErrorResponse).toBeDefined();
        expect(spec.components.schemas.SuccessResponse).toBeDefined();
    });
});
