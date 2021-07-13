# NestJS BaseService

## An opinionated base service for NestJS

[![Test Coverage](https://api.codeclimate.com/v1/badges/0b07bfc6bc5725ebec5f/test_coverage)](https://codeclimate.com/github/Vizzuality/nestjs-base-service/test_coverage)

Built with :heartpulse: at [Vizzuality](https://vizzuality.com).

## Roadmap

* [ ] Add tutorial
* [ ] Add tests
* [ ] Implement transaction support
* [ ] Implement opinionated batching
* [ ] Add support for validation (via plugin?)
* [ ] Add support for auditing (via plugin?)
* [ ] Add support for pagination
* [ ] Add support for serialization
* [ ] Add support for batching of operations


## License

(C) Copyright [Vizzuality](https://vizzuality.com) 2020-2021.

Distributed under the [MIT](LICENSE) license.


## Usage

### Filtering on listing GET requests

- Add the necessary decorator to your request parsing, on your controller method, like so:

```typescript
import {
  FetchSpecification,
  ProcessFetchSpecification,
} from 'nestjs-base-service';

@Controller(`/api/v1/some-model`)
@ApiTags(someModelResource.className)
export class SomeModelController {
  constructor(public readonly someModelsService: SomeModelsService) {}

  @Get()
  async findAll(
    @ProcessFetchSpecification(['status'])
      fetchSpecification: FetchSpecification,
  ): Promise<SomeModel> {
    const results = await this.someModelsService.findAllPaginated(
      fetchSpecification,
    );
    return this.someModelsService.serialize(results.data, results.metadata);
  }
}
```

- Ensure your service class extends the included `BaseService` class.
- On your controller decorator argument, optionally pass a whitelist of filtering parameters (recommended).
