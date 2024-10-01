import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
} from '@nestjs/common';
import { PsychologistsService } from './psychologists.service';
import { CreatePsychologistDto } from './dto/create-psychologist.dto';
import { UpdatePsychologistDto } from './dto/update-psychologist.dto';

@Controller('psychologists')
export class PsychologistsController {
  constructor(private readonly psychologistsService: PsychologistsService) {}

  @Post()
  create(@Body() createPsychologistDto: CreatePsychologistDto) {
    console.log(createPsychologistDto);
    return this.psychologistsService.create(createPsychologistDto);
  }

  @Get()
  findAll() {
    return this.psychologistsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.psychologistsService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updatePsychologistDto: UpdatePsychologistDto
  ) { 
    return this.psychologistsService.update(id, updatePsychologistDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.psychologistsService.remove(+id);
  }
}
