import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Req,
  Res,
  UnauthorizedException,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Request, Response } from 'express';
import { GetUser } from '@src/shared/decorators/get-user.decorator';
import { UserResponseDto } from './dto/response-user.dto';
import { GetMeResponseDto } from './dto/user.dto';
import { UsersService } from './users.service';
import { AuthService } from '@src/auth/auth.service';

@ApiBearerAuth()
@Controller('users')
export class UsersController {
  public constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  // TODO: /users (GET) 회원 목록 조회
  @Post('userlist')
  @ApiResponse({ status: 200, description: '회사에 따른 유저 정보 전달' })
  public async getUsers(@Body() body: { companyId: string }, @Res() res: Response): Promise<void> {
    console.log('body', body);
    const userlist = await this.usersService.getUsers(body);
    console.log('userlist', userlist);
    res.status(200).json({ message: '모든 유저의 정보 조회에 성공하였습니다', data: userlist });
  }
  // TODO: /users?search=김스낵 (GET) 회원 검색
  // TODO: /users/me (GET) 유저 정보 조회(본인 정보 조회)
  @Get('me')
  public async getMe(@GetUser() user: User): Promise<GetMeResponseDto> {
    return this.usersService.getMe(user.id);
  }

  // TODO: /users/{userId} (GET) 특정 유저 정보 조회
  @Get(':userId')
  @ApiOperation({
    summary: '유저 정보 조회',
    description: '유저 정보를 조회합니다.',
  })
  @ApiResponse({ status: 200, description: '유저 정보 전달' })
  public async getUser(@Param('userId') userId: string): Promise<UserResponseDto> {
    return await this.usersService.getUser(userId);
  }

  // TODO: /users/{userId} (PUT/PATCH) 유저 정보 수정(유저 본인 정보 수정)
  @Patch('update/info')
  @ApiResponse({ status: 200, description: '유저 정보 수정' })
  public async updateData(
    @Body() body: { password?: string; company?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { sub: userId } = await this.authService.getUserFromCookie(req);

    if (!userId) {
      throw new UnauthorizedException('유효하지 않은 사용자');
    }

    const result = await this.usersService.updateData({
      userId,
      password: body.password,
      company: body.company,
    });

    res.status(200).json({ message: '프로필 변경에 성공하였습니다', data: result });
  }
  // TODO: /users/{userId}/role (PATCH) [최고관리자] 유저 권한 수정
  // @Patch('/update/role')
  // @ApiResponse({ status: 200, description: '유저 권한 수정' })
  // public async updateRole(
  //   @Body() body: { urserId: string; role: string },
  //   @Res() res: Response,
  // ): Promise<void> {}

  // TODO: /users/{userId} (DELETE) 유저 정보 삭제(회원 탈퇴, 본인의 회원 탈퇴 또는 최고관리자가 탈퇴 처리)
}
