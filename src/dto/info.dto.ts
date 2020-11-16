import { User } from 'modules/users/users.entity';

export interface InfoDto {
  params?: any;
  authenticatedUser?: User;
  others?: any;
}
