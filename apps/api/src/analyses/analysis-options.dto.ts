import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class AnalysisOptions {
  @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean()
  captureContext = false;
}
