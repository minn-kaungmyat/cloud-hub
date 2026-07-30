import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { prisma } from '../database/prisma';
import { AppError } from '../utils/AppError';
import type { RegisterInput, LoginInput } from '../schemas/auth.schema';

const signToken = (id: string) => {
  const options: SignOptions = {
    expiresIn: '7d',
  };
  return jwt.sign({ id }, process.env.JWT_SECRET as string, options);
};

export class AuthService {
  static async registerUser(input: RegisterInput) {
    const { email, name, password } = input;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AppError('Email already in use', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        avatar: name.charAt(0).toUpperCase(),
      },
    });

    const token = signToken(user.id);
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
  }

  static async loginUser(input: LoginInput) {
    const { email, password } = input;

    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new AppError('Incorrect email or password', 401);
    }

    const token = signToken(user.id);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword, token };
  }
}
