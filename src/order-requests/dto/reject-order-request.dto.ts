import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsString } from 'class-validator';

export class RejectOrderRequestDto {
  @ApiProperty({ description: '주문 요청을 거절한 관리자 ID', example: 'admin-uuid-5678' })
  @IsUUID()
  resolverId: string;

  @ApiProperty({ description: '거절 메시지', example: '예산 부족으로 인해 거절되었습니다.' })
  @IsString()
  notes: string;
}
