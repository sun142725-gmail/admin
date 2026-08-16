# 公共组件库使用说明

组件统一放在 `src/shared/components` 目录下，通过入口应用注册的 `@shared/components` 插件全局注册，页面中直接使用标签即可，无需逐个 `import`。

所有组件均以 `Base` 前缀命名，例如 `<base-button />`。

## 组件清单

| 组件 | 作用 |
|------|------|
| BaseButton | 按钮与防抖点击 |
| BaseEmpty | 空状态 |
| BaseLoading | 加载态 |
| BaseModal | 弹窗 |
| BaseTag | 标签 |
| BaseImage | 图片 |
| BaseCard | 卡片 |
| BaseRadio | 单选（纯 CSS，不依赖 Vant） |
| BaseDatePicker | 日期选择器（年月日 / 年月） |
| BaseScroll | BetterScroll 容器 |
| BaseSwiper | 轮播 |
| BaseTabs | 标签页 |
| SelfForm | 自研表单容器（async-validator 校验） |
| SelfFormItem | 表单项（标签 / 校验 / 错误提示） |
| SelfDrawer | 抽屉（四向弹出 + 滚动 + 下拉关闭） |
| SelfUpload | 图片上传（预览 / 重试 / 数量限制） |

---

## BaseButton 按钮

基于 Vant Button 封装，增加防抖、loading 与禁用联动。

### Props

| 属性       | 类型      | 默认值    | 说明                       |
|------------|-----------|-----------|----------------------------|
| type       | string    | primary   | 同 Vant Button type        |
| size       | string    | normal    | 同 Vant Button size        |
| loading    | boolean   | false     | 加载状态，自动禁用点击     |
| disabled   | boolean   | false     | 禁用状态                   |
| block      | boolean   | false     | 块级按钮                   |
| round      | boolean   | true      | 圆角                       |
| plain      | boolean   | false     | 朴素按钮                   |
| color      | string    | ''        | 自定义颜色                 |
| debounce   | number    | 0         | 防抖间隔，单位 ms          |

### Events

| 事件   | 说明         |
|--------|--------------|
| click  | 点击事件     |

### 示例

```vue
<base-button type="primary" block @click="submit">
  提交
</base-button>

<base-button :debounce="500" @click="handleClick">
  防抖按钮
</base-button>
```

---

## BaseEmpty 空状态

用于列表无数据、页面异常等场景。

### Props

| 属性         | 类型              | 默认值       | 说明                  |
|--------------|-------------------|--------------|-----------------------|
| image        | string            | ''           | 自定义图片地址        |
| imageSize    | string / number   | 120          | 图片尺寸              |
| icon         | string            | warning-o    | Vant 图标名称         |
| iconSize     | string / number   | 64           | 图标大小              |
| iconColor    | string            | #c9cdd4      | 图标颜色              |
| description  | string            | 暂无数据     | 描述文字              |
| showButton   | boolean           | false        | 是否显示操作按钮      |
| buttonText   | string            | 重新加载     | 按钮文字              |

### Events

| 事件   | 说明             |
|--------|------------------|
| click  | 点击按钮事件     |

### 示例

```vue
<base-empty
  icon="warning-o"
  description="暂无订单"
  :show-button="true"
  button-text="去逛逛"
  @click="goHome"
/>
```

---

## BaseLoading 加载

支持局部加载与全屏遮罩。

### Props

| 属性    | 类型              | 默认值       | 说明                  |
|---------|-------------------|--------------|-----------------------|
| visible | boolean           | false        | 是否显示              |
| text    | string            | 加载中...    | 提示文字              |
| type    | string            | circular     | 加载图标类型          |
| size    | string / number   | 24           | 图标大小              |
| textSize| string / number   | 14           | 文字大小              |
| color   | string            | #0ea5e9      | 图标颜色              |
| fixed   | boolean           | false        | 是否全屏固定定位      |

### 示例

```vue
<!-- 局部 -->
<base-loading :visible="loading" text="正在加载..." />

<!-- 全屏 -->
<base-loading :visible="visible" fixed text="请稍候" />
```

---

## BaseModal 弹窗

基于 Vant Popup，统一确认/取消操作。

### Props

| 属性                 | 类型              | 默认值   | 说明                       |
|----------------------|-------------------|----------|----------------------------|
| modelValue           | boolean           | false    | 是否显示                   |
| title                | string            | ''       | 标题                       |
| width                | string / number   | 80%      | 宽度                       |
| maxWidth             | string / number   | 320      | 最大宽度                   |
| round                | boolean           | true     | 圆角                       |
| position             | string            | center   | 弹出位置                   |
| closeable            | boolean           | false    | 是否显示关闭图标           |
| closeOnClickOverlay  | boolean           | true     | 点击遮罩关闭               |
| showFooter           | boolean           | true     | 是否显示底部按钮           |
| showCancel           | boolean           | true     | 是否显示取消按钮           |
| cancelText           | string            | 取消     | 取消按钮文字               |
| confirmText          | string            | 确认     | 确认按钮文字               |
| confirmLoading       | boolean           | false    | 确认按钮 loading           |

### Events

| 事件                | 说明                     |
|---------------------|--------------------------|
| update:modelValue   | 双向绑定显示状态         |
| confirm             | 点击确认                 |
| cancel              | 点击取消                 |
| closed              | 动画结束关闭             |

### 示例

```vue
<base-modal v-model="visible" title="提示" @confirm="onConfirm">
  <p>弹窗内容</p>
</base-modal>
```

---

## BaseRadio 单选

纯 CSS+HTML 单选组件，不依赖 Vant Radio，避免 shared 目录下的 Vant 组件渲染问题。

### Props

| 属性        | 类型                                  | 默认值      | 说明                                          |
|-------------|---------------------------------------|-------------|-----------------------------------------------|
| modelValue  | string / number / boolean             | ''          | v-model 绑定值                                |
| options     | array                                 | []          | 选项：`['男', '女']` 或 `[{ label, value, disabled }]` |
| direction   | string                                | horizontal  | 排列方向：horizontal / vertical               |
| disabled    | boolean                               | false       | 整组禁用                                      |
| theme       | string                                | primary     | 颜色主题：primary / success / warning / danger |

### Events

| 事件                | 说明                     |
|---------------------|--------------------------|
| update:modelValue   | 选中值变化               |
| change              | 选中值变化，参数为选中值 |

### 示例

```vue
<base-radio v-model="form.gender" :options="['男', '女']" />

<base-radio
  v-model="form.type"
  :options="[
    { label: '日常', value: 'daily' },
    { label: '纪念', value: 'anniversary', disabled: true }
  ]"
  direction="vertical"
  theme="success"
/>
```

---

## BaseDatePicker 日期选择器

封装 Vant DatePicker + Popup，支持年月日 / 仅年月两种精度。

### Props

| 属性        | 类型    | 默认值         | 说明                              |
|-------------|---------|----------------|-----------------------------------|
| modelValue  | string  | ''             | 绑定值，`YYYY-MM-DD` 或 `YYYY-MM` |
| precision   | string  | day            | 精度：day=年月日 / month=仅年月   |
| placeholder | string  | 请选择日期     | 占位文案                          |
| minDate     | Date    | 1970-01-01     | 最小日期                          |
| maxDate     | Date    | 今天           | 最大日期                          |
| title       | string  | ''             | 弹窗标题，默认按精度自动          |

### Events

| 事件                | 说明                                   |
|---------------------|----------------------------------------|
| update:modelValue   | 确认选择后更新绑定值                   |
| change              | 确认选择，参数为结果字符串（同上格式） |

### 示例

```vue
<base-date-picker v-model="form.date" />

<base-date-picker v-model="form.month" precision="month" title="选择月份" />
```

---

## SelfForm 表单容器

自研移动端表单核心容器，基于 async-validator 统一校验；通过 provide/inject 与 SelfFormItem 通信，支持实时防抖校验与提交校验失败滚动定位。必须与 `SelfFormItem` 配合使用。

### Props

| 属性            | 类型               | 默认值   | 说明                                          |
|-----------------|--------------------|----------|-----------------------------------------------|
| modelValue      | object             | —        | 表单数据对象，支持 `:model` / `v-model` 两种写法 |
| rules           | object             | {}       | 校验规则，key 对应 model 的字段名             |
| labelPosition   | string             | top      | 标签位置：top 在上 / left 在左                |
| labelWidth      | string / number    | auto     | 标签宽度（left 模式生效），数字按 px          |
| requiredMark    | boolean            | true     | 是否显示必填红星                              |
| disabled        | boolean            | false    | 整表禁用                                      |
| showErrorMessage | boolean           | true     | 是否展示错误提示                              |
| scroller        | object             | null     | BaseScroll 实例，校验失败滚动定位；不传用原生 scrollIntoView 兜底 |

规则项支持 `trigger` 字段区分触发时机：`blur` / `change` / `submit`（change 为输入后 300ms 防抖实时校验，submit 校验全部规则）。

### Events

| 事件               | 说明                                   |
|--------------------|----------------------------------------|
| submit             | 全量校验通过后触发                     |
| validate           | 字段校验完成，参数 (prop, valid, message) |

### Methods

| 方法                                   | 说明                                     |
|----------------------------------------|------------------------------------------|
| validate()                             | 全量校验，返回 `{ valid, errors }`，失败滚动到首个错误项 |
| validateField(prop, trigger?)          | 校验单个字段                             |
| clearValidate(prop?)                   | 清除校验状态，不传则清除全部             |
| resetFields(prop?)                     | 重置字段为初始值并清除校验               |

### 内置规则 formRules

从 `@shared/components/SelfForm.vue` 具名导入，便于快速拼装 rules：`formRules.required(msg?)`、`formRules.mobile(msg?)`、`formRules.email(msg?)`、`formRules.number(msg?)`、`formRules.length(min, max, msg?)`。

### 示例

```vue
<script setup>
import { ref } from 'vue'
import { formRules } from '@shared/components/SelfForm.vue'

const formRef = ref()
const form = ref({ name: '', mobile: '' })
const rules = {
  name: [formRules.required('请输入姓名')],
  mobile: [formRules.required('请输入手机号'), formRules.mobile()]
}

async function onSubmit() {
  const { valid } = await formRef.value.validate()
  if (valid) { /* 提交 */ }
}
</script>

<template>
  <self-form ref="formRef" v-model="form" :rules="rules" @submit="onSubmit">
    <self-form-item label="姓名" prop="name">
      <input v-model="form.name" class="input" />
    </self-form-item>
    <self-form-item label="手机号" prop="mobile">
      <input v-model="form.mobile" type="tel" class="input" />
    </self-form-item>
    <base-button block @click="onSubmit">提交</base-button>
  </self-form>
</template>
```

---

## SelfFormItem 表单项

单行表单项包装器，渲染标签 / 必填星 / 控件容器 / 错误提示，承接 SelfForm 上下文完成字段级校验。需放在 `SelfForm` 内使用。

### Props

| 属性          | 类型               | 默认值 | 说明                                        |
|---------------|--------------------|--------|---------------------------------------------|
| prop          | string             | —      | 字段名，对应 SelfForm model 的 key          |
| label         | string             | —      | 标签文本                                    |
| rules         | array              | —      | 当前项校验规则，优先于 SelfForm.rules[prop] |
| required      | boolean            | false  | 是否必填（仅控制红星展示，实际校验以 rules 为准） |
| labelPosition | string             | top    | 标签位置，覆盖 SelfForm 的 labelPosition    |
| labelWidth    | string / number    | —      | 标签宽度，覆盖 SelfForm 的 labelWidth       |
| error         | string             | ''     | 外部受控错误文案                            |
| showError     | boolean            | true   | 是否展示该项错误提示                        |

### Slots

| 插槽名  | 说明                                                    |
|---------|---------------------------------------------------------|
| default | 控件内容，作用域参数 `{ blur, change, disabled }`        |
| label   | 自定义标签，作用域参数 `{ label }`                       |

### Methods

| 方法           | 说明               |
|----------------|--------------------|
| validate()     | 校验当前字段       |
| clearValidate() | 清除校验状态     |
| resetField()   | 重置为初始值       |

### 示例

```vue
<self-form-item label="备注" prop="remark" :rules="[{ required: true, message: '请输入备注', trigger: 'blur' }]">
  <textarea v-model="form.remark" rows="3" class="input"></textarea>
</self-form-item>
```

---

## SelfDrawer 抽屉

四向弹出抽屉，内部 BaseScroll 滚动 + nestedScroll 联动 + 下拉关闭手势 + 遮罩点击关闭 + 滚动位置记忆。

### Props

| 属性         | 类型     | 默认值 | 说明                                |
|-------------|----------|--------|-------------------------------------|
| modelValue  | boolean  | false  | 是否显示                            |
| direction   | string   | bottom | 弹出方向：bottom / top / left / right |
| title       | string   | ''     | 标题                                |
| closeable   | boolean  | true   | 是否显示右上角关闭按钮              |
| maskClosable | boolean | true   | 点击遮罩是否关闭                    |
| maxHeight   | string   | 85vh   | 最大高度（bottom / top 生效）       |
| maxWidth    | string   | 80%    | 最大宽度（left / right 生效）       |
| pullDistance | number  | 80     | 底部抽屉下拉关闭触发距离 px         |

### Events

| 事件                | 说明         |
|---------------------|--------------|
| update:modelValue   | 显示状态变化 |
| open                | 打开后触发   |
| close               | 关闭后触发   |

### Slots

| 插槽名  | 说明     |
|---------|----------|
| default | 内容     |
| header  | 自定义头部 |
| footer  | 底部     |

### Methods

| 方法         | 说明                     |
|-------------|--------------------------|
| open()      | 打开抽屉                 |
| close()     | 关闭抽屉                 |
| getScroller() | 获取内部 BaseScroll 实例 |

### 示例

```vue
<self-drawer v-model="visible" title="编辑资料" direction="bottom">
  <p>抽屉内容</p>
  <template #footer>
    <div class="p-16">
      <base-button block>保存</base-button>
    </div>
  </template>
</self-drawer>
```

---

## SelfUpload 图片上传

自研移动端图片上传，内置文件格式 / 大小校验、预览、删除、数量限制、loading、失败重试。上传逻辑通过 `uploadFn` 注入（与存储服务解耦），不传 `uploadFn` 时降级为本地 base64 预览。

### Props

| 属性      | 类型                          | 默认值  | 说明                                       |
|--------------|-------------------------------|---------|--------------------------------------------|
| modelValue | string / string[]             | []      | 绑定值：单图为 url 字符串，多图为 url 数组 |
| multiple   | boolean                       | false   | 是否多选                                   |
| max        | number                        | 1       | 最多上传数量（multiple 生效）              |
| accept     | string                        | image/* | 接受的文件类型                             |
| maxSize    | number                        | 5       | 单文件大小上限，单位 MB                    |
| disabled   | boolean                       | false   | 禁用                                       |
| deletable  | boolean                       | true    | 是否可删除                                 |
| uploadFn   | (file: File) => Promise<string> | —    | 上传函数，返回资源 url；不传则本地 base64 预览 |

### Events

| 事件                | 说明                     |
|---------------------|--------------------------|
| update:modelValue   | 上传成功 / 删除后更新    |
| change              | 文件列表变化             |
| error               | 校验失败，参数为错误信息 |

### Methods

| 方法     | 说明           |
|----------|----------------|
| trigger() | 手动触发选择文件 |

### 示例

```vue
<script setup>
import { uploadFile } from '@/services/files'
</script>

<template>
  <!-- 单图 -->
  <self-upload v-model="form.avatar" :upload-fn="uploadFile" />

  <!-- 多图，最多 9 张，单张不超过 2MB -->
  <self-upload
    v-model="form.images"
    multiple
    :max="9"
    :max-size="2"
    :upload-fn="uploadFile"
  />
</template>
```

---

## BaseTag 标签

用于状态、标记、分类等场景。

### Props

| 属性       | 类型      | 默认值    | 说明                       |
|------------|-----------|-----------|----------------------------|
| type       | string    | primary   | 类型：primary / success / danger / warning / default |
| plain      | boolean   | false     | 是否空心                   |
| round      | boolean   | true      | 是否圆角                   |
| color      | string    | ''        | 自定义背景/边框色          |
| textColor  | string    | ''        | 自定义文字色               |

### 示例

```vue
<base-tag type="primary">标签</base-tag>
<base-tag type="success" plain>成功</base-tag>
<base-tag color="#7232dd" text-color="#7232dd">自定义</base-tag>
```

---

## BaseImage 图片

封装图片加载、等比占位、错误占位。

### Props

| 属性    | 类型              | 默认值   | 说明                  |
|---------|-------------------|----------|-----------------------|
| src     | string            | ''       | 图片地址              |
| alt     | string            | ''       | 替代文本              |
| width   | string / number   | ''       | 宽度                  |
| height  | string / number   | ''       | 高度                  |
| radius  | string / number   | 8        | 圆角                  |
| ratio   | string / number   | ''       | 宽高比，如 16/9       |

### 示例

```vue
<base-image src="https://xxx.jpg" width="100%" ratio="16/9" :radius="12" />
<base-image src="error.jpg" width="120" height="120" />
```

---

## BaseCard 卡片

通用卡片容器，支持标题、header/footer 插槽。

### Props

| 属性    | 类型      | 默认值   | 说明                  |
|---------|-----------|----------|-----------------------|
| title   | string    | ''       | 标题                  |
| icon    | boolean   | true     | 标题左侧是否显示色块  |
| shadow  | boolean   | true     | 是否显示阴影          |
| padding | boolean   | true     | 内容区是否留白        |

### Slots

| 插槽名    | 说明                       |
|-----------|----------------------------|
| default   | 内容                       |
| header    | 标题右侧自定义内容         |
| footer    | 底部                       |

### 示例

```vue
<base-card title="今日推荐">
  <p>卡片内容</p>
</base-card>

<base-card title="我的订单">
  <template #header>
    <span>查看全部</span>
  </template>
  <!-- 内容 -->
</base-card>
```

---

## BaseScroll 滚动容器

基于 BetterScroll 2.0 封装，支持纵向/横向滚动、下拉刷新、上拉加载、滚动条。

### Props

| 属性             | 类型                | 默认值       | 说明                                 |
|------------------|---------------------|--------------|--------------------------------------|
| direction        | string              | vertical     | 滚动方向：vertical / horizontal / free |
| click            | boolean             | true         | 是否派发点击事件                     |
| pullDownRefresh  | boolean / object    | false        | 是否开启下拉刷新                     |
| pullUpLoad       | boolean / object    | false        | 是否开启上拉加载                     |
| scrollbar        | boolean / object    | false        | 是否显示滚动条                       |
| probeType        | number              | 0            | 滚动监听精度                         |
| listenScroll     | boolean             | false        | 是否监听滚动位置                     |
| mouseWheel       | boolean / object    | false        | 是否启用鼠标滚轮                     |
| nestedScroll     | boolean / object    | false        | 是否启用嵌套滚动（用于 Tabs 等场景） |

### Events

| 事件         | 说明                     |
|--------------|--------------------------|
| scroll       | 滚动中                   |
| scrollStart  | 开始滚动                 |
| scrollEnd    | 滚动结束                 |
| pullingDown  | 下拉刷新触发             |
| pullingUp    | 上拉加载触发             |

### Slots

| 插槽名    | 说明                       |
|-----------|----------------------------|
| default   | 滚动内容                   |
| pullDown  | 下拉状态，参数 { status }  |
| pullUp    | 上拉状态，参数 { status }  |

### Methods

| 方法              | 说明                     |
|-------------------|--------------------------|
| refresh()         | 刷新滚动尺寸             |
| finishPullDown()  | 结束下拉刷新             |
| finishPullUp(hasMore) | 结束上拉加载，hasMore=false 表示无更多 |
| enablePullUp()    | 重新开启上拉加载         |
| scrollTo(x, y, time) | 滚动到指定位置       |

### 示例

```vue
<base-scroll
  ref="scrollRef"
  :pull-down-refresh="true"
  :pull-up-load="true"
  :scrollbar="true"
  @pulling-down="onRefresh"
  @pulling-up="onLoadMore"
>
  <van-cell v-for="item in list" :key="item.id" :title="item.title" />
</base-scroll>
```

---

## BaseSwiper 轮播

基于 BetterScroll 2.0 Slide 插件封装，支持循环、自动播放、分页点、自定义内容。

### Props

| 属性          | 类型      | 默认值   | 说明                  |
|---------------|-----------|----------|-----------------------|
| list          | array     | []       | 数据列表              |
| keyField      | string    | ''       | 唯一键字段名          |
| loop          | boolean   | true     | 是否循环              |
| autoplay      | boolean   | true     | 是否自动播放          |
| interval      | number    | 3000     | 自动播放间隔 ms       |
| showDots      | boolean   | true     | 是否显示分页点        |
| initialIndex  | number    | 0        | 初始索引              |
| speed         | number    | 400      | 切换速度 ms           |
| vertical      | boolean   | false    | 是否纵向轮播          |

### Events

| 事件   | 说明                     |
|--------|--------------------------|
| change | 当前页变化               |
| click  | 点击当前页               |

### Methods

| 方法              | 说明                     |
|-------------------|--------------------------|
| refresh()         | 刷新尺寸                 |
| goToPage(index)   | 跳转到指定页             |
| prev()            | 上一页                   |
| next()            | 下一页                   |

### 示例

```vue
<base-swiper :list="bannerList" :loop="true" :autoplay="true">
  <template #default="{ item, index }">
    <img :src="item.image" class="w-full h-full object-cover" />
  </template>
</base-swiper>
```

---

## BaseTabs 标签页

基于 BetterScroll 2.0 Slide + nested-scroll 封装，支持点击/左右滑动切换 Tab，内部垂直滚动与横向切换手势互不冲突。

### Props

| 属性        | 类型      | 默认值   | 说明                  |
|-------------|-----------|----------|-----------------------|
| tabs        | array     | []       | Tab 数据 { title, key?, content? } |
| modelValue  | number    | 0        | 当前激活索引          |
| speed       | number    | 300      | 切换动画时长 ms       |
| loop        | boolean   | false    | 是否循环切换          |
| swipeable   | boolean   | true     | 是否允许滑动切换      |

### Events

| 事件                | 说明                     |
|---------------------|--------------------------|
| update:modelValue   | 激活索引变化             |
| change              | 切换完成，参数 (index, tab) |

### Slots

| 插槽名             | 说明                                           |
|--------------------|------------------------------------------------|
| default            | 所有 Tab 默认内容，参数 { tab, index, active } |
| tab-${index}       | 单独定义第 index 个 Tab 的内容                 |

### Methods

| 方法              | 说明                     |
|-------------------|--------------------------|
| refresh()         | 刷新尺寸                 |
| switchTab(index)  | 切换到指定 Tab           |

### 示例

```vue
<base-tabs v-model="activeIndex" :tabs="tabs" @change="onChange">
  <template #default="{ tab, index, active }">
    <base-scroll v-if="active" nested-scroll>
      <div class="p-16">{{ tab.content }}</div>
    </base-scroll>
  </template>
</base-tabs>
```

### 手势冲突说明

- 外层 Tab 内容区使用 BetterScroll 横向 Slide，配置 `nestedScroll: true`
- 内部垂直滚动区域使用 `<base-scroll nested-scroll>`，同样开启 `nestedScroll`
- BetterScroll 的 `nested-scroll` 插件会自动判断手势方向，横向滑动切换 Tab，纵向滑动交给内部滚动
