import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { asyncHandler } from '../utils/asyncHandler';

export class AuthController {
  static register = asyncHandler(async (req: Request, res: Response) => {
    const result = await AuthService.registerUser(req.body);
    
    res.status(201).json({
      status: 'success',
      data: result,
    });
  });

  static login = asyncHandler(async (req: Request, res: Response) => {
    const result = await AuthService.loginUser(req.body);

    res.status(200).json({
      status: 'success',
      data: result,
    });
  });

  static me = asyncHandler(async (req: Request, res: Response) => {
    // req.user is attached by the requireAuth middleware
    const user = req.user;
    
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...userWithoutPassword } = user;
      res.status(200).json({
        status: 'success',
        data: {
          user: userWithoutPassword,
        },
      });
    }
  });
}
