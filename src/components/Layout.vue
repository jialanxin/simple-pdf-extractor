<template>
    <el-container>
        <el-header>
            <el-row>
                <el-col :span="10" />
                <el-col :span="4">
                    <span>PDF to Notion
                    </span>
                </el-col>
                <el-col :span="10" />
            </el-row>
        </el-header>
        <el-main>
            <el-row :gutter="20">
                <el-col :span="16">
                    <el-input v-model="Token" placeholder="Notion Secret Token" />
                </el-col>
                <el-col :span="4">
                    <el-button type="primary">Save Token Locally</el-button>
                </el-col>
                <el-col :span="4">
                    <el-button type="info">Load Local Token</el-button>
                </el-col>
            </el-row>
            <el-row :gutter="20">

                <el-upload action="#" ref="upload" :auto-upload="false" :limit="1" :on-exceed="handleExceed" v-model:file-list="fileList" :on-change="handleChange">
                
                        <template #trigger>
                            <el-button type="primary">select PDF</el-button>
                        </template>
                        <el-button type="info" @click="convert">Convert
                            </el-button>
             
                </el-upload>

            </el-row>
            <el-row v-for="(paragraph,index) in textField" :key="index">
                <div>{{ paragraph }}</div>
            </el-row>
        </el-main>
    </el-container>
</template>

<script setup lang="ts">
import { ref } from 'vue'
const Token = ref('')
import { genFileId } from 'element-plus'
import type { UploadInstance, UploadProps, UploadRawFile, UploadUserFile, UploadFile, UploadFiles } from 'element-plus'

const upload = ref<UploadInstance>()
const fileList = ref<UploadUserFile[]>([
])

const handleExceed: UploadProps['onExceed'] = (files) => {
  upload.value!.clearFiles()
  const file = files[0] as UploadRawFile
  file.uid = genFileId()
  upload.value!.handleStart(file)
}

const handleChange: UploadProps['onChange'] = (_: UploadFile, uploadFiles:UploadFiles) =>{
    console.log(uploadFiles)
}
// @ts-ignore
import {ReadPDF} from "../utils/PDFConvert";
const textField = ref<String[]>([])

async function convert (){
    console.log("Start Convert")
    const file =  fileList.value[0].raw
    const textList:String[] = await ReadPDF(file)
    textField.value = textList
}

</script>

<style>
.el-row {
  margin-bottom: 20px;
}
</style>