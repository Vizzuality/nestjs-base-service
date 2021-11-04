import * as httpMock from 'node-mocks-http';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import {
  ProcessFetchSpecification,
  ProcessFetchSpecificationArguments,
} from 'decorators/process-fetch-specification.decorator';
import 'reflect-metadata';

describe('Test ProcessFetchSpecification decorator', () => {
  function getParamDecoratorFactory() {
    class TestController {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      public testHTTPMethodImplementation(@ProcessFetchSpecification() value) {}
    }

    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TestController,
      'testHTTPMethodImplementation'
    );
    return args[Object.keys(args)[0]].factory;
  }

  it('When no request filters are provided, the request no filter values', () => {
    const req = httpMock.createRequest({
      method: 'GET',
      url: '/get',
    });
    const res = httpMock.createResponse();
    const mockDecoratorData = new ExecutionContextHost([req, res]);
    const factory = getParamDecoratorFactory();
    const processFetchSpecificationResultArguments: ProcessFetchSpecificationArguments = {};
    const processFetchSpecificationResult = factory(
      processFetchSpecificationResultArguments,
      mockDecoratorData
    );
    expect(processFetchSpecificationResult.filter).toStrictEqual(undefined);
  });

  it('When no request filters are provided but the configuration has filter values, the request no filter values', () => {
    const req = httpMock.createRequest({
      method: 'GET',
      url: '/get',
    });
    const res = httpMock.createResponse();
    const mockDecoratorData = new ExecutionContextHost([req, res]);
    const factory = getParamDecoratorFactory();
    const processFetchSpecificationResultArguments: ProcessFetchSpecificationArguments = {
      allowedFilters: ['foo'],
    };
    const processFetchSpecificationResult = factory(
      processFetchSpecificationResultArguments,
      mockDecoratorData
    );
    expect(processFetchSpecificationResult.filter).toStrictEqual(undefined);
  });

  it('When request filters match the configuration, the request has the provided filter values', () => {
    const req = httpMock.createRequest({
      method: 'GET',
      url: '/get',
      query: {
        filter: {
          foo: 'bar',
        },
      },
    });
    const res = httpMock.createResponse();
    const mockDecoratorData = new ExecutionContextHost([req, res]);
    const factory = getParamDecoratorFactory();
    const processFetchSpecificationResultArguments: ProcessFetchSpecificationArguments = {
      allowedFilters: ['foo'],
    };
    const processFetchSpecificationResult = factory(
      processFetchSpecificationResultArguments,
      mockDecoratorData
    );
    expect(processFetchSpecificationResult.filter).toStrictEqual({ foo: ['bar'] });
  });

  it('When request filters are not present in the configuration, the request has the provided filter values', () => {
    const req = httpMock.createRequest({
      method: 'GET',
      url: '/get',
      query: {
        filter: {
          foo: 'bar',
        },
      },
    });
    const res = httpMock.createResponse();
    const mockDecoratorData = new ExecutionContextHost([req, res]);
    const factory = getParamDecoratorFactory();
    const processFetchSpecificationResultArguments: ProcessFetchSpecificationArguments = {
      allowedFilters: ['goo'],
    };
    expect(() => factory(processFetchSpecificationResultArguments, mockDecoratorData)).toThrowError(
      `Invalid filter key: foo`
    );
  });
});
